/**
 * Autentique auth. Static API key — no OAuth.
 */
import type { Credentials } from '@opensteward/shared'
import type { CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('autentique uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'API Token',
      type: 'password',
      required: true,
      helpText: 'Found in Integrações → API on the Autentique dashboard.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('autentique credentialFields require apiKey')
  return { accessToken: apiKey, extra: {} }
}
