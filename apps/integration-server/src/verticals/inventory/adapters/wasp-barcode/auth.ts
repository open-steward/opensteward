/**
 * Wasp InventoryCloud auth — API key (Bearer token).
 *
 * Users authenticate by providing:
 *   1. Their tenant subdomain (e.g. "acme" → acme.waspinventorycloud.com)
 *   2. Their API key (passed as a Bearer token in Authorization header)
 *
 * The API key is obtained from the InventoryCloud admin portal.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('wasp-barcode uses static API key; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'tenant',
      label: 'Tenant Subdomain',
      type: 'text',
      required: true,
      helpText: 'Your InventoryCloud subdomain, e.g. "acme" for acme.waspinventorycloud.com',
    },
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      helpText: 'Bearer token obtained from the InventoryCloud admin portal',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const tenant = (fields['tenant'] ?? '').trim()
  const apiKey = (fields['apiKey'] ?? '').trim()
  if (!tenant) throw new Error('wasp-barcode: tenant subdomain is required')
  if (!apiKey) throw new Error('wasp-barcode: apiKey is required')
  return {
    accessToken: apiKey,
    extra: { tenant },
  }
}
