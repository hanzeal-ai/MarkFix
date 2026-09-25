export abstract class EmailPort {
  abstract sendVerification(email: string, token: string): Promise<void>;
  abstract sendPasswordReset(email: string, token: string): Promise<void>;
}

export class DevelopmentEmailAdapter extends EmailPort {
  async sendVerification(email: string, token: string): Promise<void> {
    void email;
    void token;
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    void email;
    void token;
  }
}

export class WebhookEmailAdapter extends EmailPort {
  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string | undefined,
    private readonly dashboardOrigin: string,
  ) {
    super();
  }

  sendVerification(email: string, token: string): Promise<void> {
    return this.send(
      'verify-email',
      email,
      `${this.dashboardOrigin}/verify-email?token=${encodeURIComponent(token)}`,
    );
  }

  sendPasswordReset(email: string, token: string): Promise<void> {
    return this.send(
      'reset-password',
      email,
      `${this.dashboardOrigin}/reset-password?token=${encodeURIComponent(token)}`,
    );
  }

  private async send(template: string, email: string, actionUrl: string): Promise<void> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({ template, email, actionUrl }),
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) throw new Error(`Email delivery failed with status ${response.status}`);
  }
}

export class ResendEmailAdapter extends EmailPort {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly replyTo: string | undefined,
    private readonly dashboardOrigin: string,
  ) {
    super();
    if (!apiKey.trim() || /\s/.test(apiKey) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from)) {
      throw new Error('Resend requires an API key and a plain sender email address');
    }
    if (replyTo && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(replyTo)) {
      throw new Error('Invalid email reply-to address');
    }
    if (new URL(dashboardOrigin).protocol !== 'https:') {
      throw new Error('Resend action links require HTTPS');
    }
  }

  sendVerification(email: string, token: string): Promise<void> {
    return this.send(email, '验证你的 MarkFix 邮箱', 'verify-email', token);
  }

  sendPasswordReset(email: string, token: string): Promise<void> {
    return this.send(email, '重置你的 MarkFix 密码', 'reset-password', token);
  }

  private async send(email: string, subject: string, path: string, token: string): Promise<void> {
    const actionUrl = `${this.dashboardOrigin}/${path}?token=${encodeURIComponent(token)}`;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        from: this.from,
        to: [email],
        subject,
        text: `${subject}：\n\n${actionUrl}\n\n如果这不是你的操作，请忽略此邮件。`,
        ...(this.replyTo ? { reply_to: this.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) throw new Error(`Email delivery failed with status ${response.status}`);
    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new Error('Email provider returned an invalid acknowledgment');
    }
    if (
      !result ||
      typeof result !== 'object' ||
      !('id' in result) ||
      typeof result.id !== 'string' ||
      !result.id
    ) {
      throw new Error('Email provider did not acknowledge the message');
    }
  }
}

export function configuredEmailAdapter(
  environment: NodeJS.ProcessEnv,
  dashboardOrigin: string,
): EmailPort {
  const production = environment.NODE_ENV === 'production';
  if (production && environment.MARKFIX_EXPOSE_AUTH_TOKENS === 'true') {
    throw new Error('Production must not expose authentication tokens');
  }
  if (production && (environment.MARKFIX_DEMO_PASSWORD || environment.MARKFIX_DEMO_EMAIL)) {
    throw new Error('Remove demo seeding configuration before enabling production');
  }
  const provider =
    environment.MARKFIX_EMAIL_PROVIDER ??
    (environment.MARKFIX_EMAIL_WEBHOOK_URL ? 'webhook' : 'development');
  if (provider === 'resend') {
    return new ResendEmailAdapter(
      environment.RESEND_API_KEY ?? '',
      environment.MARKFIX_EMAIL_FROM ?? '',
      environment.MARKFIX_EMAIL_REPLY_TO,
      dashboardOrigin,
    );
  }
  if (provider === 'webhook' && environment.MARKFIX_EMAIL_WEBHOOK_URL) {
    return new WebhookEmailAdapter(
      environment.MARKFIX_EMAIL_WEBHOOK_URL,
      environment.MARKFIX_EMAIL_WEBHOOK_API_KEY,
      dashboardOrigin,
    );
  }
  if (provider === 'development' && !production) return new DevelopmentEmailAdapter();
  throw new Error(
    'A configured email provider is required; production cannot use development email',
  );
}
