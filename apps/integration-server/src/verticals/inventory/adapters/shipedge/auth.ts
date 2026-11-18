/**
 * ShipEdge credential fields.
 *
 * ShipEdge uses static API key authentication. Credentials are passed as body
 * parameters (account_id, key, warehouse) on every request. The integration
 * slug determines the tenant subdomain.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('shipedge uses API key + account ID; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
    { name: 'accountId', label: 'Account ID', type: 'text', required: true },
    { name: 'warehouse', label: 'Warehouse Identifier', type: 'text', required: true },
    { name: 'integration', label: 'Integration Slug (subdomain)', type: 'text', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  const accountId = fields['accountId']
  const warehouse = fields['warehouse']
  const integration = fields['integration']
  if (!apiKey || !accountId || !warehouse || !integration) {
    throw new Error('shipedge credentialFields require apiKey, accountId, warehouse, and integration slug')
  }
  return {
    accessToken: apiKey,
    extra: { accountId, warehouse, integration },
  }
}
