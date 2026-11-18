import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('stocktrim uses api-auth-id + api-auth-signature; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'tenantId', label: 'Tenant ID (api-auth-id)', type: 'text', required: true },
    { name: 'tenantName', label: 'Tenant Name (api-auth-signature)', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const tenantId = fields['tenantId']
  const tenantName = fields['tenantName']
  if (!tenantId || !tenantName) throw new Error('stocktrim credentialFields require tenantId + tenantName')
  // accessToken carries tenantId; tenantName travels in extra
  return { accessToken: tenantId, extra: { tenantName } }
}
