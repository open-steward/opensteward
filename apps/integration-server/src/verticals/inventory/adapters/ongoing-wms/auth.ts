/**
 * Ongoing WMS auth helpers.
 *
 * The Goods Owner REST API uses HTTP Basic Authentication.
 * Credentials: username + password, plus the warehouse code that forms part of
 * the base URL (https://api.ongoingsystems.se/{warehouse}/api/v1/).
 *
 * We treat the whole set as an api_key credential group:
 *   - username   → stored as accessToken
 *   - password   → stored in extra.password
 *   - warehouse  → stored in extra.warehouse   (slug from the WMS admin)
 *   - goodsOwnerId → stored in extra.goodsOwnerId (integer, required for filtering)
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('ongoing-wms uses HTTP Basic Auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'username', label: 'API Username', type: 'text', required: true },
    { name: 'password', label: 'API Password', type: 'password', required: true },
    { name: 'warehouse', label: 'Warehouse Code (slug in URL)', type: 'text', required: true },
    { name: 'goodsOwnerId', label: 'Goods Owner ID (integer)', type: 'text', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const username = fields['username']
  const password = fields['password']
  const warehouse = fields['warehouse']
  const goodsOwnerId = fields['goodsOwnerId']
  if (!username || !password || !warehouse || !goodsOwnerId) {
    throw new Error('ongoing-wms requires username, password, warehouse, and goodsOwnerId')
  }
  return {
    accessToken: username,
    extra: { password, warehouse, goodsOwnerId },
  }
}
