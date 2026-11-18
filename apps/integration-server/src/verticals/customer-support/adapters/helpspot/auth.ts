import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('HelpSpot uses API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'baseUrl',
      label: 'HelpSpot Installation URL',
      type: 'text',
      required: true,
      // e.g. https://helpspot.mycompany.com/helpspot
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
  const baseUrl = fields['baseUrl']?.replace(/\/+$/, '')
  const apiKey = fields['apiKey']
  if (!baseUrl) throw new Error('HelpSpot credentialFields require baseUrl')
  if (!apiKey) throw new Error('HelpSpot credentialFields require apiKey')
  return {
    accessToken: apiKey,
    extra: { baseUrl },
  }
}
