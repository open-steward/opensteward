/**
 * Restaurant365 auth helpers.
 *
 * R365 issues API credentials (bearer token + tenant subdomain) directly to
 * authorised vendor/integration partners — there is no OAuth dance.
 * Credentials are supplied manually via credentialFields().
 *
 * Auth: api_key pattern.
 *   accessToken — the bearer token issued by R365 Support
 *   extra.subdomain — the tenant subdomain (e.g. "mycompany" from mycompany.restaurant365.com)
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('restaurant365 uses bearer token + tenant subdomain; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'API Bearer Token', type: 'password', required: true },
    { name: 'subdomain', label: 'Tenant Subdomain (e.g. mycompany)', type: 'text', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  const subdomain = fields['subdomain']
  if (!apiKey) throw new Error('restaurant365 credentialFields require apiKey (bearer token)')
  if (!subdomain) throw new Error('restaurant365 credentialFields require subdomain')
  return { accessToken: apiKey, extra: { subdomain } }
}
