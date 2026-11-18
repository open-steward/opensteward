import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('deskcom-desk365 uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'tenantSubdomain',
      label: 'Desk365 subdomain',
      type: 'text',
      required: true,
      helpText:
        'The subdomain of your Desk365 account (e.g. `acme` if your help desk is at `acme.desk365.io`).',
    },
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      helpText: 'Found in Desk365 → Settings → Integrations → API.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const tenantSubdomain = fields['tenantSubdomain']?.trim()
  const apiKey = fields['apiKey']?.trim()
  if (!tenantSubdomain) throw new Error('deskcom-desk365: tenantSubdomain is required')
  if (!apiKey) throw new Error('deskcom-desk365: apiKey is required')
  return {
    accessToken: apiKey,
    extra: { tenantSubdomain },
  }
}
