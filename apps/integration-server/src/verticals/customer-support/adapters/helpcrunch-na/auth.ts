/**
 * InvGate Service Management — API token authentication.
 *
 * Authentication uses a Bearer token generated via the InvGate admin panel
 * (Settings > Integrations > API) or programmatically via /user.token.
 * Customers also supply their instance hostname so the adapter can build
 * the per-tenant base URL, e.g. acme.cloud.invgate.net.
 *
 * Docs: https://releases.invgate.com/service-desk/api/
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('invgate-service-management uses API token auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'instanceHost',
      label: 'Instance hostname',
      type: 'text',
      required: true,
      helpText: 'Your InvGate instance hostname, e.g. acme.cloud.invgate.net',
    },
    {
      name: 'apiToken',
      label: 'API Token',
      type: 'password',
      required: true,
      helpText: 'Bearer token from Settings > Integrations > API in your InvGate admin panel.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const instanceHost = fields['instanceHost']?.trim()
  const apiToken = fields['apiToken']?.trim()
  if (!instanceHost) throw new Error('invgate-service-management credentials require instanceHost')
  if (!apiToken) throw new Error('invgate-service-management credentials require apiToken')
  return {
    accessToken: apiToken,
    extra: { instanceHost },
  }
}
