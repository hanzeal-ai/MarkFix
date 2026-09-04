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
