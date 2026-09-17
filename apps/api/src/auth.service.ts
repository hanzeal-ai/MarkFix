import { unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  BadRequestException,
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
const passwordMinLength = 10;
const passwordMaxLength = 200;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidPassword = (password: string): boolean =>
  password.length >= passwordMinLength && password.length <= passwordMaxLength;

type RegisterInput = {
  email?: unknown;
  password?: unknown;
  displayName?: unknown;
};

@Injectable()
export class AuthService {
  private readonly secret =
    process.env.MARKFIX_AUTH_SECRET ?? 'markfix-local-development-secret-change-before-production';
  private readonly artifactDirectory = resolve(process.env.ARTIFACT_DIR ?? './data/artifacts');

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
    if (!/^\S+@\S+\.\S+$/.test(email) || !displayName || !isValidPassword(password)) {
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
      await transaction.project.create({
        data: {
          name: 'Website feedback',
          ownerId: created.id,
          memberships: { create: { userId: created.id, role: 'OWNER' } },
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
    if (!token || !isValidPassword(password)) {
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
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const password = typeof payload.password === 'string' ? payload.password : '';
    const user = await this.database.user.findUnique({ where: { email } });
    if (
      password.length > passwordMaxLength ||
      !user?.passwordHash ||
      !(await verifyPassword(password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }
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

  async changePassword(userId: string, sessionId: string, input: unknown) {
    const payload =
      typeof input === 'object' && input !== null && !Array.isArray(input)
        ? (input as { currentPassword?: unknown; newPassword?: unknown })
        : {};
    const currentPassword =
      typeof payload.currentPassword === 'string' ? payload.currentPassword : '';
    const newPassword = typeof payload.newPassword === 'string' ? payload.newPassword : '';
    if (!isValidPassword(newPassword)) {
      throw new ConflictException('A 10-character password is required');
    }
    const user = await this.database.user.findUnique({ where: { id: userId } });
    if (
      currentPassword.length > passwordMaxLength ||
      !user?.passwordHash ||
      !(await verifyPassword(currentPassword, user.passwordHash))
    ) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (await verifyPassword(newPassword, user.passwordHash)) {
      throw new ConflictException('New password must be different from the current password');
    }
    const nextPasswordHash = await hashPassword(newPassword);
    const revokedAt = new Date();
    await this.database.$transaction(async (transaction) => {
      const updated = await transaction.user.updateMany({
        where: { id: userId, passwordHash: user.passwordHash },
        data: { passwordHash: nextPasswordHash },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Password changed while this request was in progress');
      }
      await transaction.authSession.updateMany({
        where: { userId, id: { not: sessionId }, revokedAt: null },
        data: { revokedAt },
      });
      await transaction.passwordResetToken.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: revokedAt },
      });
    });
    return { changed: true };
  }

  async exportData(userId: string) {
    const [account, memberships, reports, comments, activities, sessions] = await Promise.all([
      this.database.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          displayName: true,
          emailVerifiedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.database.membership.findMany({
        where: { userId },
        select: {
          role: true,
          status: true,
          createdAt: true,
          project: {
            select: {
              id: true,
              name: true,
              createdAt: true,
            },
          },
        },
      }),
      this.database.report.findMany({
        where: { reporterId: userId },
        select: {
          id: true,
          projectId: true,
          title: true,
          description: true,
          status: true,
          rejectionReason: true,
          priority: true,
          captureBundle: true,
          screenshotPath: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.database.comment.findMany({
        where: { authorId: userId },
        select: { id: true, reportId: true, body: true, createdAt: true, updatedAt: true },
      }),
      this.database.activity.findMany({
        where: { actorId: userId },
        select: { id: true, reportId: true, type: true, payload: true, createdAt: true },
      }),
      this.sessions(userId),
    ]);
    if (!account) throw new NotFoundException('User not found');
    return {
      exportedAt: new Date().toISOString(),
      account,
      memberships,
      reports,
      comments,
      activities,
      sessions,
    };
  }

  async deleteAccount(userId: string, input: unknown) {
    const password =
      typeof (input as { password?: unknown }).password === 'string'
        ? (input as { password: string }).password
        : '';
    const user = await this.database.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException('Password is incorrect');
    }
    const ownedProjects = await this.database.project.findMany({
      where: { ownerId: userId },
      select: { id: true, name: true, _count: { select: { memberships: true } } },
    });
    const sharedProject = ownedProjects.find((project) => project._count.memberships > 1);
    if (sharedProject) {
      throw new ConflictException(
        `Transfer or remove members from ${sharedProject.name} before deleting the account`,
      );
    }
    const artifacts = ownedProjects.length
      ? await this.database.artifact.findMany({
          where: {
            submission: {
              projectId: { in: ownedProjects.map((project) => project.id) },
            },
          },
          select: { id: true },
        })
      : [];
    await this.database.$transaction(async (transaction) => {
      if (ownedProjects.length) {
        await transaction.project.deleteMany({
          where: { id: { in: ownedProjects.map((project) => project.id) } },
        });
      }
      await transaction.user.delete({ where: { id: userId } });
    });
    await Promise.allSettled(
      artifacts.map(({ id }) => unlink(join(this.artifactDirectory, `${id}.png`))),
    );
    return { deleted: true };
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
