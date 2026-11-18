import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('snipe-it uses a Bearer API token; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'instanceUrl',
      label: 'Instance URL',
      type: 'text',
      required: true,
      // e.g. https://assets.example.com  (no trailing slash)
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
  const instanceUrl = (fields['instanceUrl'] ?? '').replace(/\/$/, '')
  const apiToken = fields['apiToken']
  if (!instanceUrl) throw new Error('snipe-it credentialFields require instanceUrl')
  if (!apiToken) throw new Error('snipe-it credentialFields require apiToken')
  return { accessToken: apiToken, extra: { instanceUrl } }
}
