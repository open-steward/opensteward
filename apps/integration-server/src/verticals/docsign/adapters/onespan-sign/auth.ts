/**
 * OneSpan Sign auth helpers — API key only.
 *
 * OneSpan uses a static API key in `Authorization: Basic <apiKey>`. The
 * adapter declares no OAuth flow; `getAuthUrl` throws and `credentialFields`
 * collects the API key for Connect Link.
 *
 * Docs: https://community.onespan.com/documentation/onespan-sign/guides/feature-guides/developer/rest-api-guide
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'OneSpan API key',
      type: 'password',
      placeholder: 'esi_...',
      helpText:
        'In OneSpan Sign, go to ADMIN → API ACCESS and copy the API key. The adapter sends it as Authorization: Basic <apiKey>.',
      required: true,
    },
  ]
}

export async function exchangeCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const apiKey = (fields.apiKey ?? '').trim()
  if (!apiKey) throw new Error('OneSpan API key is required.')
  return { accessToken: apiKey }
}
