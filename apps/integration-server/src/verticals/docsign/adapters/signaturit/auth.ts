/**
 * Signaturit auth helpers.
 *
 * Signaturit uses a static API key sent as `Authorization: Bearer
 * <apiKey>`. There is no interactive OAuth flow, so `getAuthUrl()` on
 * the adapter throws and credentials are collected via the Connect Link
 * `credentialFields()` form.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export const SIGNATURIT_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'apiKey',
    label: 'API key',
    type: 'password',
    helpText:
      'Generated in Signaturit Console → Settings → API. Treat as a long-lived secret.',
    required: true,
  },
]

export async function exchangeSignaturitCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const apiKey = (fields.apiKey ?? '').trim()
  if (!apiKey) throw new Error('Signaturit API key is required.')
  return { accessToken: apiKey }
}

export async function refreshSignaturitCredentials(
  credentials: Credentials,
): Promise<Credentials> {
  // Static API keys do not expire; nothing to refresh.
  return credentials
}
