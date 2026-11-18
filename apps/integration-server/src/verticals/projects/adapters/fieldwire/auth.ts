/**
 * Fieldwire API key authentication.
 *
 * Fieldwire uses a two-step API key flow:
 *   1. User supplies an API token (long-lived refresh token / API key).
 *   2. POST to /api_keys/jwt exchanges it for a short-lived JWT access token.
 *
 * The access token is used as a Bearer token on all subsequent requests.
 * On 401 the client should re-exchange to get a fresh JWT.
 *
 * Docs: https://developers.fieldwire.com/docs/authentication
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('fieldwire uses API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiToken',
      label: 'API Token',
      type: 'password',
      required: true,
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiToken = fields['apiToken']
  if (!apiToken) throw new Error('fieldwire credentialFields require apiToken')
  // Store the raw API token as accessToken; client will exchange for JWT on each construction.
  return { accessToken: apiToken, extra: {} }
}
