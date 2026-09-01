export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailServiceContract {
  send(message: EmailMessage): Promise<void>;
}

export interface EmailConfig {
  from: string | null;
  resendApiKey: string | null;
}

export class EmailService implements EmailServiceContract {
  constructor(private readonly config: EmailConfig) {}

  async send(message: EmailMessage): Promise<void> {
    if (!this.config.from || !this.config.resendApiKey) {
      // No provider is configured, which is the normal state for local development. Log the
      // notification instead of silently dropping it so the flow stays visible without a real
      // Resend account; nothing here is a secret.
      console.info("email_not_configured_logging_instead", message);
      return;
    }
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.resendApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: this.config.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!response.ok) {
      throw new Error(`Resend request failed with status ${response.status}`);
    }
  }
}
