import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('booqable uses an API access token; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'accessToken', label: 'API Access Token', type: 'password', required: true },
    { name: 'companySlug', label: 'Company Slug (subdomain)', type: 'text', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const accessToken = fields['accessToken']
  const companySlug = fields['companySlug']
  if (!accessToken || !companySlug) {
    throw new Error('booqable credentialFields require accessToken + companySlug')
  }
  return { accessToken, extra: { companySlug } }
}
