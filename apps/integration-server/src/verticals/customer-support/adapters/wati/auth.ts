/**
 * WATI authentication — static API key (Bearer token).
 *
 * Every WATI account has a dedicated endpoint URL and a Bearer token,
 * both visible in the in-app API Docs section.
 *
 * Docs: https://docs.wati.io/docs/getting-started
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('wati uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiEndpoint',
      label: 'API Endpoint URL',
      type: 'text',
      required: true,
      helpText: 'Your WATI API endpoint URL (e.g. https://live-mt-server.wati.io/12345). Find it in Settings → API Docs.',
    },
    {
      name: 'apiKey',
      label: 'Bearer Token',
      type: 'password',
      required: true,
      helpText: 'Your WATI Bearer token. Find it in Settings → API Docs.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  const apiEndpoint = fields['apiEndpoint']
  if (!apiKey) throw new Error('wati credentialFields require apiKey (Bearer token)')
  if (!apiEndpoint) throw new Error('wati credentialFields require apiEndpoint')
  const baseUrl = apiEndpoint.replace(/\/$/, '')
  return { accessToken: apiKey, extra: { baseUrl } }
}
