import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DatabaseService } from './database.service.js';
import { EmailPort } from './email.port.js';
import {
  createOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
  type AccessClaims,
} from './auth-crypto.js';

const accessLifetimeSeconds = 15 * 60;
const refreshLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RegisterInput = {
  email?: unknown;
  password?: unknown;
  displayName?: unknown;
  workspaceName?: unknown;
};

@Injectable()
export class AuthService {
  private readonly secret =
    process.env.MARKFIX_AUTH_SECRET ?? 'markfix-local-development-secret-change-before-production';

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(EmailPort) private readonly email: EmailPort,
  ) {
    if (process.env.NODE_ENV === 'production' && !process.env.MARKFIX_AUTH_SECRET) {
      throw new Error('MARKFIX_AUTH_SECRET is required in production');
    }
  }

  async register(input: unknown) {
    const payload = input as RegisterInput;
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const password = typeof payload.password === 'string' ? payload.password : '';
    const displayName =
      typeof payload.displayName === 'string' ? payload.displayName.trim().slice(0, 120) : '';
    const workspaceName =
      typeof payload.workspaceName === 'string' && payload.workspaceName.trim()
        ? payload.workspaceName.trim().slice(0, 120)
        : `${displayName || 'My'} workspace`;
    if (
      !/^\S+@\S+\.\S+$/.test(email) ||
      !displayName ||
      password.length < 10 ||
      password.length > 200
    ) {
      throw new ConflictException(
        'A valid email, display name, and 10-character password are required',
      );
    }
    if (await this.database.user.findUnique({ where: { email } })) {
      throw new ConflictException('An account with this email already exists');
    }
    const passwordHash = await hashPassword(password);
    const verificationToken = createOpaqueToken();
    const user = await this.database.$transaction(async (transaction) => {
      const created = await transaction.user.create({
        data: {
          email,
          displayName,
          passwordHash,
          verificationTokens: {
            create: {
              tokenHash: hashOpaqueToken(verificationToken),
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          },
        },
      });
      await transaction.workspace.create({
        data: {
          name: workspaceName,
          createdById: created.id,
          memberships: { create: { userId: created.id, role: 'OWNER' } },
          projects: { create: { name: 'Website feedback' } },
        },
      });
      await this.email.sendVerification(email, verificationToken);
      return created;
    });
    return {
      user: this.publicUser(user),
      verificationRequired: true,
      ...(this.exposesAuthTokens() ? { verificationToken } : {}),
    };
  }

  async forgotPassword(input: unknown) {
    const email =
      typeof (input as { email?: unknown }).email === 'string'
        ? (input as { email: string }).email.trim().toLowerCase()
        : '';
    const user = email ? await this.database.user.findUnique({ where: { email } }) : null;
    if (!user?.passwordHash) return { accepted: true };
    const resetToken = createOpaqueToken();
    await this.database.$transaction(async (transaction) => {
      await transaction.passwordResetToken.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await transaction.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashOpaqueToken(resetToken),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });
      await this.email.sendPasswordReset(user.email, resetToken);
    });
    return { accepted: true, ...(this.exposesAuthTokens() ? { resetToken } : {}) };
  }

  async resetPassword(input: unknown) {
    const payload = input as { token?: unknown; password?: unknown };
    const token = typeof payload.token === 'string' ? payload.token : '';
    const password = typeof payload.password === 'string' ? payload.password : '';
    if (!token || password.length < 10 || password.length > 200) {
      throw new ConflictException('A valid token and 10-character password are required');
    }
    const reset = await this.database.passwordResetToken.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
    });
    if (!reset || reset.consumedAt || reset.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException('Password reset token is invalid or expired');
    }
    const passwordHash = await hashPassword(password);
    await this.database.$transaction(async (transaction) => {
      const consumed = await transaction.passwordResetToken.updateMany({
        where: { id: reset.id, consumedAt: null, expiresAt: { gt: new Date() } },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new ConflictException('Password reset token is invalid or expired');
      }
      await transaction.user.update({ where: { id: reset.userId }, data: { passwordHash } });
      await transaction.authSession.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    return { reset: true };
  }

  async verifyEmail(input: unknown) {
    const token = (input as { token?: unknown }).token;
    if (typeof token !== 'string' || !token) throw new ConflictException('Token is required');
    const verification = await this.database.emailVerificationToken.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
    });
    if (!verification) throw new NotFoundException('Verification token not found');
    if (verification.consumedAt) throw new ConflictException('Verification token was already used');
    if (verification.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException('Verification token has expired');
    }
    await this.database.$transaction([
      this.database.user.update({
        where: { id: verification.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      this.database.emailVerificationToken.update({
        where: { id: verification.id },
        data: { consumedAt: new Date() },
      }),
    ]);
    return { verified: true };
  }

  async login(input: unknown) {
    const payload = input as { email?: unknown; password?: unknown; deviceName?: unknown };
    const identifier = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const demoUsername =
      process.env.MARKFIX_DEMO_USERNAME ??
      (process.env.MARKFIX_DEMO_PASSWORD ? 'admin' : undefined);
    const email =
      demoUsername && identifier === demoUsername.toLowerCase()
        ? (process.env.MARKFIX_DEMO_EMAIL ?? 'admin@markfix.local')
        : identifier;
    const password = typeof payload.password === 'string' ? payload.password : '';
    const user = await this.database.user.findUnique({ where: { email } });
    if (
      password.length > 200 ||
      !user?.passwordHash ||
      !(await verifyPassword(password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.emailVerifiedAt) throw new UnauthorizedException('Email verification is required');
    return this.createSession(
      user.id,
      typeof payload.deviceName === 'string' && payload.deviceName.trim()
        ? payload.deviceName.trim().slice(0, 120)
        : 'Unknown device',
    );
  }

  async refresh(input: unknown) {
    const refreshToken = (input as { refreshToken?: unknown }).refreshToken;
    if (typeof refreshToken !== 'string' || !refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }
    const tokenHash = hashOpaqueToken(refreshToken);
    const sessionId = refreshToken.split('.')[0];
    if (!sessionId || !uuidPattern.test(sessionId)) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }
    const session = await this.database.authSession.findUnique({ where: { id: sessionId } });
    if (session && session.refreshTokenHash !== tokenHash && !session.revokedAt) {
      await this.database.authSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token replay detected; session revoked');
    }
    if (
      !session ||
      session.refreshTokenHash !== tokenHash ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }
    const nextRefreshToken = `${session.id}.${createOpaqueToken()}`;
    const updated = await this.database.authSession.updateMany({
      where: { id: session.id, refreshTokenHash: tokenHash, revokedAt: null },
      data: {
        refreshTokenHash: hashOpaqueToken(nextRefreshToken),
        lastUsedAt: new Date(),
      },
    });
    if (updated.count !== 1) throw new UnauthorizedException('Refresh token was already rotated');
    return this.tokens(session.userId, session.id, nextRefreshToken);
  }

  async authenticate(token: string): Promise<AccessClaims> {
    let claims: AccessClaims;
    try {
      claims = verifyAccessToken(token, this.secret);
    } catch {
      throw new UnauthorizedException('Access token is invalid or expired');
    }
    const session = await this.database.authSession.findUnique({ where: { id: claims.sid } });
    if (
      !session ||
      session.userId !== claims.sub ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('Session is no longer active');
    }
    return claims;
  }

  async logout(userId: string, sessionId: string) {
    await this.database.authSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { loggedOut: true };
  }

  async me(userId: string) {
    const user = await this.database.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.publicUser(user);
  }

  async sessions(userId: string) {
    return this.database.authSession.findMany({
      where: { userId },
      select: {
        id: true,
        deviceName: true,
        expiresAt: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeSession(userId: string, sessionId: string) {
    if (!uuidPattern.test(sessionId)) throw new NotFoundException('Session not found');
    const result = await this.database.authSession.updateMany({
      where: { id: sessionId, userId },
      data: { revokedAt: new Date() },
    });
    if (result.count !== 1) throw new NotFoundException('Session not found');
    return { revoked: true };
  }

  private async createSession(userId: string, deviceName: string) {
    const sessionId = crypto.randomUUID();
    const refreshToken = `${sessionId}.${createOpaqueToken()}`;
    const session = await this.database.authSession.create({
      data: {
        id: sessionId,
        userId,
        deviceName,
        refreshTokenHash: hashOpaqueToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshLifetimeMs),
      },
    });
    return this.tokens(userId, session.id, refreshToken);
  }

  private tokens(userId: string, sessionId: string, refreshToken: string) {
    return {
      accessToken: signAccessToken(
        { sub: userId, sid: sessionId, exp: Math.floor(Date.now() / 1000) + accessLifetimeSeconds },
        this.secret,
      ),
      refreshToken,
      expiresIn: accessLifetimeSeconds,
    };
  }

  private publicUser(user: {
    id: string;
    email: string;
    displayName: string;
    emailVerifiedAt: Date | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      emailVerified: Boolean(user.emailVerifiedAt),
    };
  }

  private exposesAuthTokens(): boolean {
    return (
      process.env.MARKFIX_EXPOSE_AUTH_TOKENS === 'true' ||
      (process.env.NODE_ENV !== 'production' && process.env.MARKFIX_EXPOSE_AUTH_TOKENS !== 'false')
    );
  }
}
