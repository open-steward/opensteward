import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('Missive uses personal API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      helpText:
        'Your Missive personal access token (starts with `missive_pat-`). ' +
        'Generate one in Missive Preferences → API tab. Requires an organization on the Productive plan.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('Missive credentialFields require apiKey')
  return { accessToken: apiKey, extra: {} }
}
