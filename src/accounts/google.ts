export type GoogleIdentityProfile = {
  sub: string
  email: string
  emailVerified: boolean
  name: string | null
  pictureUrl: string | null
}

type GoogleTokenInfoResponse = {
  sub?: string
  aud?: string
  email?: string
  email_verified?: string | boolean
  name?: string
  picture?: string
  error?: string
  error_description?: string
}

export async function verifyGoogleCredential(credential: string, clientId: string): Promise<GoogleIdentityProfile> {
  const normalizedCredential = credential.trim()
  const normalizedClientId = clientId.trim()
  if (!normalizedCredential) throw new Error('missing_google_credential')
  if (!normalizedClientId) throw new Error('missing_google_client_id')

  let response: Response
  try {
    response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(normalizedCredential)}`)
  } catch {
    throw new Error('google_credential_invalid')
  }
  let body: GoogleTokenInfoResponse
  try {
    body = await response.json() as GoogleTokenInfoResponse
  } catch {
    throw new Error('google_credential_invalid')
  }
  if (!response.ok || body.error) {
    throw new Error('google_credential_invalid')
  }
  if (body.aud !== normalizedClientId) throw new Error('google_credential_audience_mismatch')
  const sub = body.sub?.trim() ?? ''
  const email = body.email?.trim().toLowerCase() ?? ''
  if (!sub || !email) throw new Error('google_credential_profile_incomplete')
  const emailVerified = body.email_verified === true || body.email_verified === 'true'
  if (!emailVerified) throw new Error('google_email_not_verified')

  return {
    sub,
    email,
    emailVerified,
    name: body.name ?? null,
    pictureUrl: body.picture ?? null,
  }
}
