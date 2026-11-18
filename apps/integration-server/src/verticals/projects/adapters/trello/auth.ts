import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('trello uses an API token + secret pair; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'API Key', type: 'password', required: true, helpText: 'From https://trello.com/app-key' },
    { name: 'apiToken', label: 'API Token', type: 'password', required: true, helpText: 'Generated via the OAuth-1a manual approval flow at trello.com.' },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  const apiToken = fields['apiToken']
  if (!apiKey || !apiToken) throw new Error('trello credentialFields require apiKey + apiToken')
  // Combine into the accessToken slot for the client; the client appends both
  // to every request as ?key=...&token=... query params.
  return { accessToken: `${apiKey}:${apiToken}`, extra: { apiKey, apiToken } }
}
