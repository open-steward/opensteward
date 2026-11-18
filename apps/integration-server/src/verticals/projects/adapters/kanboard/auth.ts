import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('kanboard uses API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'baseUrl',
      label: 'Kanboard Instance URL',
      type: 'text',
      required: true,
      helpText: 'Base URL of your Kanboard instance, e.g. https://kanboard.example.com',
    },
    {
      name: 'apiToken',
      label: 'API Token',
      type: 'password',
      required: true,
      helpText:
        'API token from Kanboard Settings → API. Use the application token (user "jsonrpc") for full access.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const baseUrl = fields['baseUrl']
  const apiToken = fields['apiToken']
  if (!baseUrl) throw new Error('kanboard credentialFields require baseUrl')
  if (!apiToken) throw new Error('kanboard credentialFields require apiToken')
  // Encode "jsonrpc:<token>" as Base64 for HTTP Basic auth
  const encoded = Buffer.from(`jsonrpc:${apiToken}`).toString('base64')
  return {
    accessToken: encoded,
    extra: { baseUrl: baseUrl.replace(/\/$/, ''), apiToken },
  }
}
