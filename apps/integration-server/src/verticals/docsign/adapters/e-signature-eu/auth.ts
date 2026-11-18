/**
 * e-Signature.eu auth helpers.
 *
 * e-Signature.eu uses two static credentials, both issued in the dashboard
 * under Settings > API:
 *   - an API key, sent on every request as the `x-api-key` header, and
 *   - a numeric user id, sent on every request as the `userid` query param.
 *
 * Both are long-lived, so there is no interactive OAuth flow and no token
 * refresh: `getAuthUrl()` throws and credentials are collected via the
 * Connect Link `credentialFields()` form. The API key is stored as the
 * canonical `accessToken`; the user id is stashed on `extra.userId`.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export const ESIGNATURE_EU_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'apiKey',
    label: 'API key',
    type: 'password',
    helpText:
      'Found in your e-Signature.eu dashboard under Settings > API. Treat as a long-lived secret.',
    required: true,
  },
  {
    name: 'userId',
    label: 'User ID',
    type: 'text',
    helpText:
      'The numeric user id shown alongside your API key in Settings > API. Sent as the "userid" query parameter.',
    required: true,
  },
]

export async function exchangeESignatureEuCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const apiKey = (fields.apiKey ?? '').trim()
  const userId = (fields.userId ?? '').trim()
  if (!apiKey) throw new Error('e-Signature.eu API key is required.')
  if (!userId) throw new Error('e-Signature.eu user ID is required.')
  return { accessToken: apiKey, extra: { userId } }
}

export async function refreshESignatureEuCredentials(
  credentials: Credentials,
): Promise<Credentials> {
  return credentials
}
