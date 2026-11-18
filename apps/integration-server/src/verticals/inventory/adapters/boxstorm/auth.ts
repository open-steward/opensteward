/**
 * Boxstorm authentication.
 *
 * Boxstorm (Fishbowl Advanced cloud) uses a Bearer token for every API call.
 * The token is obtained by calling POST /api/login with username + password,
 * but operators can also pre-generate a long-lived API token from the Boxstorm
 * Settings > Integrations screen and supply it directly.
 *
 * We model this as a single api_key credential: the caller pastes the
 * pre-generated token (or a token they have already obtained via login).
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('boxstorm uses an API token; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'API Token',
      type: 'password',
      required: true,
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('boxstorm credentialFields require apiKey (Bearer token)')
  return { accessToken: apiKey }
}
