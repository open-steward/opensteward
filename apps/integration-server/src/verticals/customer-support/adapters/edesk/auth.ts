/**
 * eDesk auth — static API key.
 * The key is passed as a Bearer token in the Authorization header.
 * Docs: https://developers.edesk.com/reference/authentication
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('eDesk uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      helpText: 'Generate an API key in your eDesk account under Settings > API Tokens.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('eDesk credentialFields require apiKey')
  return { accessToken: apiKey, extra: {} }
}
