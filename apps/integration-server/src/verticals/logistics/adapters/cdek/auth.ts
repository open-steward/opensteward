/**
 * CDEK auth — OAuth 2.0 client_credentials flow.
 *
 * Token endpoint:
 *   POST https://api.cdek.ru/v2/oauth/token
 *   Body (form-encoded): grant_type=client_credentials&client_id=...&client_secret=...
 *
 * Tokens expire in 3600 seconds.  refreshCredentials re-runs the grant using
 * the clientId/clientSecret stored in credentials.extra.
 */
import type { CredentialField, Credentials } from '@opensteward/shared'
import { oauth2ClientCredentials } from '@opensteward/shared'
import { CDEK_TOKEN_URL } from './constants'

const FORM = oauth2ClientCredentials({
  tokenUrl: CDEK_TOKEN_URL,
  buildExtra: (input) => ({
    clientId: input['clientId'] ?? '',
    clientSecret: input['clientSecret'] ?? '',
  }),
})

export function credentialFields(): CredentialField[] {
  return FORM.credentialFields()
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  return FORM.exchangeCredentials(fields)
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = credentials.extra ?? {}
  const clientId = String(extra['clientId'] ?? '')
  const clientSecret = String(extra['clientSecret'] ?? '')
  if (!clientId || !clientSecret) {
    // Cannot refresh — return the existing credentials and let the next call fail.
    return credentials
  }
  return FORM.exchangeCredentials({ clientId, clientSecret })
}
