/**
 * SaldeoSMART API-key authentication.
 *
 * SaldeoSMART uses a signed-request scheme (not plain OAuth):
 *   - username: the Saldeo login used to access the account
 *   - api_token: the secret token (found under Account Settings in Saldeo)
 *
 * Every API request requires three HTTP parameters:
 *   - username  – the account username
 *   - req_id    – a unique request identifier (timestamp-based)
 *   - req_sig   – MD5 signature over sorted params + api_token appended
 *
 * req_sig algorithm (from official spec v4.0.0):
 *   1. Collect all request params (including username, req_id, any query params).
 *   2. Sort them alphabetically by key name.
 *   3. Encode as "key=value" pairs joined with "&" (URL-encoded values).
 *   4. Append the raw api_token at the end of the string.
 *   5. MD5-hash the result and hex-encode it (lowercase).
 *
 * This adapter stores username + api_token together as
 * `credentials.accessToken` in the format "username|api_token".
 * The client splits on "|" at request time.
 *
 * No OAuth flow exists. `getAuthUrl`, `exchangeCode`, and `refreshCredentials`
 * are stubs; credentials are entered via credentialFields/exchangeCredentials.
 */

import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error(
    'SaldeoSMART uses API-key authentication; use credentialFields() and exchangeCredentials() instead',
  )
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'username',
      label: 'SaldeoSMART username',
      type: 'text',
      required: true,
      helpText: 'The username (email or login) you use to log in to SaldeoSMART.',
    },
    {
      name: 'apiToken',
      label: 'API token',
      type: 'password',
      required: true,
      helpText:
        'Your SaldeoSMART API token. Find it under Account Settings → API token in the SaldeoSMART portal.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const username = (fields['username'] ?? '').trim()
  const apiToken = (fields['apiToken'] ?? '').trim()
  if (!username) throw new Error('SaldeoSMART credentials require a username')
  if (!apiToken) throw new Error('SaldeoSMART credentials require an API token')
  // Encode both values into a single accessToken string separated by |
  // The SaldeoClient will split this back out at request time.
  return { accessToken: `${username}|${apiToken}` }
}
