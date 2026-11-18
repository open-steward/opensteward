/**
 * FreeScout authentication.
 *
 * FreeScout uses API Key auth.  The key is passed as `X-FreeScout-API-Key`
 * header on every request.  The instance URL is also required because
 * FreeScout is self-hosted.
 *
 * Docs: https://api-docs.freescout.net/
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('freescout uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'instanceUrl',
      label: 'Instance URL',
      type: 'text',
      required: true,
    },
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const instanceUrl = fields['instanceUrl']?.replace(/\/+$/, '')
  const apiKey = fields['apiKey']
  if (!instanceUrl) throw new Error('freescout credentialFields require instanceUrl')
  if (!apiKey) throw new Error('freescout credentialFields require apiKey')
  return { accessToken: apiKey, extra: { instanceUrl } }
}
