export { isVerdunAccountTier } from './account-types.js'

export type VerdunAccountCookieOptions = {
  secure?: boolean
  maxAgeSeconds?: number
}

export const verdunAccountCookieName = 'verdun_account'
export const verdunDefaultSessionMaxAgeSeconds = 60 * 60 * 24 * 30

export function verdunSessionCookie(token: string, options: VerdunAccountCookieOptions = {}): string {
  const secure = options.secure ?? true
  return [
    `${verdunAccountCookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${options.maxAgeSeconds ?? verdunDefaultSessionMaxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ')
}

export function clearVerdunSessionCookie(options: VerdunAccountCookieOptions = {}): string {
  const secure = options.secure ?? true
  return [
    `${verdunAccountCookieName}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ')
}

export function verdunCookieValue(header: string | undefined, name = verdunAccountCookieName): string {
  if (!header) return ''
  const parts = header.split(';')
  for (const part of parts) {
    const [rawName, ...rawValue] = part.trim().split('=')
    if (rawName !== name) continue
    try {
      return decodeURIComponent(rawValue.join('='))
    } catch {
      return ''
    }
  }
  return ''
}
