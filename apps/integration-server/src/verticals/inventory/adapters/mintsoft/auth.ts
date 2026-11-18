import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('mintsoft uses an API key; use credentialFields() instead')
}

/**
 * Mintsoft supports two key modes:
 *  - Static key: generated from the Mintsoft UI / support desk; never expires.
 *  - Dynamic key: fetched via POST /api/Auth (username + password); expires 24 h.
 *
 * We expose only the static key path here for simplicity — the caller can
 * pre-obtain a static key from Mintsoft support and paste it in.
 */
export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'Mintsoft API Key', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('mintsoft credentialFields require apiKey')
  return { accessToken: apiKey }
}
