// App-neutral transactional email transport. Provider-agnostic behind
// EmailSender so the backend (Resend now; Postmark/SES later) is a one-module
// swap, config-driven. When unconfigured it falls back to a log sender that
// never throws, so callers can fire-and-forget without gating on credentials.

declare const process: { env: Record<string, string | undefined> }

export type EmailMessage = {
  to: string
  subject: string
  text: string
  html?: string
  headers?: Record<string, string>
}

export type EmailSender = (message: EmailMessage) => Promise<void>

// The from address is the deploying app's responsibility (set EMAIL_FROM).
export function emailFrom(): string {
  return process.env.EMAIL_FROM ?? ''
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

// Resolve the active sender from env. EMAIL_PROVIDER forces a backend; otherwise
// Resend is used when an API key is present, else the log fallback.
export function getEmailSender(): EmailSender {
  const provider = process.env.EMAIL_PROVIDER ?? (emailConfigured() ? 'resend' : 'log')
  if (provider === 'resend' && emailConfigured()) return resendSender
  return logSender
}

const logSender: EmailSender = async (message) => {
  console.log(`[email:log] to=${message.to} subject=${JSON.stringify(message.subject)}`)
}

const resendSender: EmailSender = async (message) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: emailFrom(),
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
      headers: message.headers,
    }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`resend_send_failed_${response.status}: ${body.slice(0, 200)}`)
  }
}
