/**
 * Sproof Sign auth helpers.
 *
 * sproof Sign uses a static API key sent as the `token` query parameter. No
 * interactive OAuth flow — the adapter's `getAuthUrl()` throws and
 * credentials are collected via the Connect Link `credentialFields()`
 * form.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export const SPROOF_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'apiKey',
    label: 'API key',
    type: 'password',
    helpText: 'Found in the settings page of the sproof Sign administrator profile (enterprise plan). Treat as a long-lived secret.',
    required: true,
  },
]

export async function exchangeSproofCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const apiKey = (fields.apiKey ?? '').trim()
  if (!apiKey) throw new Error('Sproof Sign API key is required.')
  return { accessToken: apiKey }
}

export async function refreshSproofCredentials(
  credentials: Credentials,
): Promise<Credentials> {
  return credentials
}
