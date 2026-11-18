/**
 * Smartsupp auth — static API key (Bearer token).
 * Users obtain an access token by contacting Smartsupp support or via
 * their account settings.
 * Docs: https://docs.smartsupp.com/rest-api/get-started/
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('smartsupp uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'API Key (Bearer Token)',
      type: 'password',
      required: true,
      helpText:
        'Your Smartsupp access token. Obtain it from your account settings or by contacting Smartsupp support.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('smartsupp credentialFields require apiKey')
  return { accessToken: apiKey, extra: {} }
}
