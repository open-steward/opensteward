/**
 * Shelf.nu authentication.
 *
 * Shelf uses Supabase JWT tokens as the "API key".
 * Clients obtain a JWT by authenticating with Supabase (email/password or OAuth)
 * and provide it as a Bearer token.
 * The organisation ID scopes every request to a specific workspace.
 *
 * Credential fields:
 *   - accessToken: Supabase JWT (long-lived refresh_token or short-lived access_token)
 *   - organizationId: the Shelf organisation/workspace ID
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('shelf-nu uses Supabase JWT + organizationId; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'accessToken', label: 'Supabase Access Token (JWT)', type: 'password', required: true },
    { name: 'organizationId', label: 'Organization ID', type: 'text', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const accessToken = fields['accessToken']
  const organizationId = fields['organizationId']
  if (!accessToken) throw new Error('shelf-nu credentialFields require accessToken (Supabase JWT)')
  if (!organizationId) throw new Error('shelf-nu credentialFields require organizationId')
  return { accessToken, extra: { organizationId } }
}
