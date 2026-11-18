import type { Credentials, CredentialField } from '@opensteward/shared'

/**
 * InvenTree uses token-based API authentication.
 * Users generate an API token from their InvenTree instance under:
 *   Profile -> API Tokens -> Create Token
 * The token is sent as: Authorization: Token <TOKEN>
 *
 * Because InvenTree is self-hosted, users also supply their instance base URL
 * (e.g. https://inventree.example.com — without trailing slash).
 */
export function getAuthUrlUnsupported(): never {
  throw new Error('inventree uses API token + instance URL; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'baseUrl',
      label: 'InvenTree Instance URL (e.g. https://inventree.example.com)',
      type: 'text',
      required: true,
    },
    {
      name: 'apiToken',
      label: 'API Token',
      type: 'password',
      required: true,
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const baseUrl = (fields['baseUrl'] ?? '').replace(/\/+$/, '')
  const apiToken = fields['apiToken']
  if (!baseUrl) throw new Error('inventree credentialFields require baseUrl')
  if (!apiToken) throw new Error('inventree credentialFields require apiToken')
  return { accessToken: apiToken, extra: { baseUrl } }
}
