/**
 * Texada CloudLink auth.
 *
 * Texada uses a two-step API-key flow:
 *   1. The integrator holds a static x-api-key (provided by Texada staff) and a tenant slug.
 *   2. POST /auth with x-api-key header → receives a short-lived Bearer access token.
 *
 * We model this as a single "apiKey" credential field plus a "tenant" field.
 * The access token is fetched at client-construction time and stored in
 * credentials.accessToken; the raw api key lives in credentials.extra.apiKey
 * so it can be used to refresh the token when it expires.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('texada uses API key + tenant; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
    { name: 'tenant', label: 'Tenant Slug (e.g. acme)', type: 'text', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  const tenant = fields['tenant']
  if (!apiKey) throw new Error('texada credentialFields require apiKey')
  if (!tenant) throw new Error('texada credentialFields require tenant')
  // Store api key + tenant so the client can exchange for a bearer token at call time.
  return { accessToken: apiKey, extra: { apiKey, tenant } }
}
