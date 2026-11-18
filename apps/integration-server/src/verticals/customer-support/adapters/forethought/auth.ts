/**
 * Forethought authentication — API key (Bearer token) model.
 *
 * Tokens are issued by Forethought's implementation engineering team and
 * scoped per tenant. There is no OAuth flow or dynamic key generation.
 * The token is passed as `Authorization: Bearer {token}` on every request.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('forethought uses static Bearer token auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'Bearer Token',
      type: 'password',
      required: true,
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('forethought credentialFields require apiKey (Bearer token)')
  return { accessToken: apiKey, extra: {} }
}
