import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('tawk-to uses API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      helpText: 'Your tawk.to REST API key. Generate it in your tawk.to profile under Settings > API Keys.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('tawk-to credentialFields require apiKey')
  return { accessToken: apiKey, extra: {} }
}
