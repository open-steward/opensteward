/**
 * UVdesk authentication.
 *
 * UVdesk uses static API-key (access token) auth. Tokens are generated from
 * the UVdesk dashboard under Profile > Access Tokens (agents/admins) or
 * Dashboard > API Client (admin only).
 *
 * The token is passed as: Authorization: Bearer {accessToken}
 *
 * Additionally, the per-tenant subdomain must be supplied (e.g. "acme" for
 * acme.uvdesk.com) and an optional locale (defaults to "en").
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('uvdesk uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'subdomain', label: 'Subdomain', type: 'text', required: true },
    { name: 'apiKey', label: 'API Access Token', type: 'password', required: true },
    { name: 'locale', label: 'Locale (default: en)', type: 'text', required: false },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const subdomain = fields['subdomain']?.trim()
  const apiKey = fields['apiKey']?.trim()
  if (!subdomain) throw new Error('uvdesk credentialFields require subdomain')
  if (!apiKey) throw new Error('uvdesk credentialFields require apiKey')
  return {
    accessToken: apiKey,
    extra: {
      subdomain,
      locale: fields['locale']?.trim() || 'en',
    },
  }
}
