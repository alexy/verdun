// Svix webhook signature verification (e.g. Resend signs webhooks via Svix).
// Implemented directly (no svix dependency): HMAC-SHA256 over
// `${id}.${timestamp}.${payload}` keyed by the base64 secret after `whsec_`,
// compared constant-time against any v1 signature in the header, with a
// timestamp tolerance window to reject replayed webhooks (matching the
// official Svix libraries: too-old AND too-far-future timestamps both fail).

import { createHmac, timingSafeEqual } from 'node:crypto'

export type SvixHeaders = {
  id: string | undefined
  timestamp: string | undefined
  signature: string | undefined
}

export type SvixVerifyOptions = {
  /**
   * Maximum allowed difference (in seconds, either direction) between the
   * `svix-timestamp` header and the current time. Defaults to
   * `defaultSvixToleranceSeconds` (300s, the official Svix default).
   */
  toleranceSeconds?: number
}

export const defaultSvixToleranceSeconds = 300

export function verifySvixSignature(
  secret: string,
  headers: SvixHeaders,
  payload: string,
  options: SvixVerifyOptions = {},
): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false

  // Replay protection: the timestamp must be unix seconds within the
  // tolerance window of now (reject stale replays and far-future clocks).
  const toleranceSeconds = options.toleranceSeconds ?? defaultSvixToleranceSeconds
  if (!/^\d+$/.test(headers.timestamp.trim())) return false
  const timestampSeconds = Number.parseInt(headers.timestamp, 10)
  const nowSeconds = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) return false

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const signedContent = `${headers.id}.${headers.timestamp}.${payload}`
  const expected = createHmac('sha256', key).update(signedContent).digest('base64')
  const expectedBuf = Buffer.from(expected)
  // Header is space-delimited `v1,<sig> v1,<sig2> ...`; accept if any v1 matches.
  for (const part of headers.signature.split(' ')) {
    const [version, value] = part.split(',')
    if (version !== 'v1' || !value) continue
    const candidate = Buffer.from(value)
    if (candidate.length === expectedBuf.length && timingSafeEqual(candidate, expectedBuf)) return true
  }
  return false
}
