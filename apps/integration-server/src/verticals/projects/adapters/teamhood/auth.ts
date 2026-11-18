import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('teamhood uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'tenant',
      label: 'Tenant Slug (your subdomain, e.g. "acme" from acme.teamhood.com)',
      type: 'text',
      required: true,
    },
    { name: 'apiKey', label: 'API Key (from Company → Integrations)', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const { tenant, apiKey } = fields
  if (!tenant) throw new Error('teamhood credentialFields require tenant')
  if (!apiKey) throw new Error('teamhood credentialFields require apiKey')
  return { accessToken: apiKey, extra: { tenant } }
}
