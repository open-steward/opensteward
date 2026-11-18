import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('ezofficeinventory uses a Bearer API token; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiToken',
      label: 'API Token',
      type: 'password',
      required: true,
    },
    {
      name: 'subdomain',
      label: 'Company Subdomain (e.g. "acme" for acme.ezofficeinventory.com)',
      type: 'text',
      required: true,
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiToken = fields['apiToken']
  const subdomain = fields['subdomain']
  if (!apiToken || !subdomain) {
    throw new Error('ezofficeinventory credentialFields require apiToken + subdomain')
  }
  return { accessToken: apiToken, extra: { subdomain } }
}
