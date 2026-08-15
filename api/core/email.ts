// App-neutral transactional email transport. Provider-agnostic behind
// EmailSender so the backend (SMTP, Resend, or a future provider) is a one-module
// swap, config-driven. When unconfigured it falls back to a log sender that
// never throws, so callers can fire-and-forget without gating on credentials.

declare const process: { env: Record<string, string | undefined> }

import nodemailer, { type Transporter } from 'nodemailer'

export type EmailMessage = {
  from?: string
  to: string
  subject: string
  text: string
  html?: string
  headers?: Record<string, string>
}

export type EmailSender = (message: EmailMessage) => Promise<void>

export type EmailSenderOptions = {
  from?: string
}

// The from address is the deploying app's responsibility (set EMAIL_FROM).
export function emailFrom(): string {
  return process.env.EMAIL_FROM ?? ''
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY) || smtpConfigured()
}

// Resolve the active sender from env. EMAIL_PROVIDER forces a backend; otherwise
// SMTP is used when it is completely configured, otherwise Resend is used when
// an API key is present, else the log fallback. Explicitly
// forcing a provider that is missing its credentials is a deploy misconfiguration
// and fails loudly instead of silently downgrading to the log sender.
export function getEmailSender(options: EmailSenderOptions = {}): EmailSender {
  const forced = process.env.EMAIL_PROVIDER
  if (forced === 'smtp' && !smtpConfigured()) {
    throw new Error('email_provider_misconfigured: EMAIL_PROVIDER=smtp but SMTP_HOST, SMTP_USER, or SMTP_PASSWORD is not set')
  }
  if (forced === 'resend' && !process.env.RESEND_API_KEY) {
    throw new Error('email_provider_misconfigured: EMAIL_PROVIDER=resend but RESEND_API_KEY is not set')
  }
  if (forced && !['smtp', 'resend', 'log'].includes(forced)) {
    throw new Error(`email_provider_misconfigured: unsupported EMAIL_PROVIDER=${forced}`)
  }
  const provider = forced ?? (smtpConfigured() ? 'smtp' : process.env.RESEND_API_KEY ? 'resend' : 'log')
  const sender = provider === 'smtp'
    ? smtpSender
    : provider === 'resend'
      ? resendSender
      : logSender
  if (!options.from) return sender
  return message => sender({ ...message, from: message.from ?? options.from })
}

// Mask a recipient for logs: keep the first character and the domain
// (a***@domain.com) so log lines stay correlatable without leaking PII.
export function maskEmailAddress(address: string): string {
  const at = address.indexOf('@')
  if (at <= 0) return '***'
  return `${address[0]}***@${address.slice(at + 1)}`
}

const logSender: EmailSender = async (message) => {
  console.log(`[email:log] to=${maskEmailAddress(message.to)} subject=${JSON.stringify(message.subject)}`)
}

function smtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim()
    && process.env.SMTP_USER?.trim()
    && process.env.SMTP_PASSWORD,
  )
}

function smtpPort(): number {
  const raw = process.env.SMTP_PORT?.trim() || '587'
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`email_provider_misconfigured: invalid SMTP_PORT=${raw}`)
  }
  return port
}

function enabled(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value.trim() === '') return fallback
  if (['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())) return true
  if (['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase())) return false
  throw new Error(`email_provider_misconfigured: invalid boolean value ${value}`)
}

let smtpTransport: Transporter | undefined

function getSmtpTransport(): Transporter {
  if (smtpTransport) return smtpTransport
  const host = process.env.SMTP_HOST!.trim()
  smtpTransport = nodemailer.createTransport({
    host,
    port: smtpPort(),
    secure: enabled(process.env.SMTP_SECURE),
    requireTLS: enabled(process.env.SMTP_REQUIRE_TLS, true),
    auth: {
      user: process.env.SMTP_USER!.trim(),
      pass: process.env.SMTP_PASSWORD!,
    },
    tls: { servername: host, rejectUnauthorized: true },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  })
  return smtpTransport
}

const smtpSender: EmailSender = async (message) => {
  const from = message.from ?? emailFrom()
  if (!from.trim()) throw new Error('email_provider_misconfigured: EMAIL_FROM is not set')
  await getSmtpTransport().sendMail({
    from,
    to: message.to,
    envelope: { from, to: message.to },
    subject: message.subject,
    text: message.text,
    html: message.html,
    headers: message.headers,
  })
}

const resendFetchTimeoutMs = 15_000

const resendSender: EmailSender = async (message) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), resendFetchTimeoutMs)
  let response: Response
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: message.from ?? emailFrom(),
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
        headers: message.headers,
      }),
      signal: controller.signal,
    })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`resend_send_timeout: no response after ${resendFetchTimeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`resend_send_failed_${response.status}: ${body.slice(0, 200)}`)
  }
}
