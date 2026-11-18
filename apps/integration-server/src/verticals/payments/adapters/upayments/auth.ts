import type { CredentialField, Credentials } from '@opensteward/shared'

/**
 * https://developers.upayments.com/reference/hmac-authentication.md: "All
 * requests must include the standard authorization header plus the specific
 * HMAC security headers" (Authorization: "Bearer API_Key", X-Timestamp,
 * X-Signature), and the prerequisites list "API Key" and "API Secret Key".
 *
 * The API Key is kept in `accessToken` (it is the Bearer token), the API
 * Secret Key in `extra.apiSecret` (it only signs, and is never sent).
 */
export const UPAYMENTS_CREDENTIAL_FIELDS: CredentialField[] = [
  { name: 'apiKey', label: 'API Key (Bearer token)', type: 'password', required: true },
  { name: 'apiSecret', label: 'API Secret Key (HMAC)', type: 'password', required: true },
]

export function buildCredentials(fields: Record<string, string>): Credentials {
  const apiKey = (fields.apiKey ?? '').trim()
  const apiSecret = (fields.apiSecret ?? '').trim()
  if (!apiKey || !apiSecret) {
    throw new Error('UPayments needs both the API Key and the API Secret Key to sign requests.')
  }
  return { accessToken: apiKey, extra: { apiSecret } }
}
