/**
 * Taiga API key / token authentication.
 *
 * Taiga issues long-lived auth tokens reachable from User Settings → API in
 * the Taiga UI. The token is sent on every request as:
 *   Authorization: Bearer <token>
 *
 * Self-hosted instances also support "Application" tokens (admin-managed);
 * the caller passes those the same way — just supply the token value.
 *
 * No OAuth redirect flow; no automatic refresh needed.
 *
 * Docs: https://docs.taiga.io/api.html#_authentication
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('taiga uses API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiToken',
      label: 'API Token',
      type: 'password',
      required: true,
    },
    {
      name: 'baseUrl',
      label: 'Base URL (leave blank for cloud)',
      type: 'text',
      required: false,
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiToken = fields['apiToken']
  if (!apiToken) throw new Error('taiga credentialFields require apiToken')
  return {
    accessToken: apiToken,
    extra: { baseUrl: fields['baseUrl'] ?? '' },
  }
}
