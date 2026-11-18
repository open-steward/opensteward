/**
 * SignWell auth helpers — API key only.
 *
 * SignWell uses a static API key in the `X-Api-Key` header. No OAuth.
 * `getAuthUrl` throws; the Connect Link form collects the key.
 *
 * Docs: https://developers.signwell.com/reference/getting-started
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'SignWell API key',
      type: 'password',
      placeholder: 'sk_...',
      helpText:
        'In SignWell, open Settings → API and generate a key. The adapter sends it as the X-Api-Key request header.',
      required: true,
    },
  ]
}

export async function exchangeCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const apiKey = (fields.apiKey ?? '').trim()
  if (!apiKey) throw new Error('SignWell API key is required.')
  return { accessToken: apiKey }
}
