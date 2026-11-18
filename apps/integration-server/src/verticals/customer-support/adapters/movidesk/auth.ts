/**
 * Movidesk (Zenvia Service) authentication.
 *
 * Auth model: static API key (token) passed as a query-string parameter
 * `?token=<api_key>` on every request. Obtained from:
 * Settings > Account > Parameters > Environment tab.
 *
 * No OAuth flow exists — use credentialFields() / exchangeCredentials().
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('movidesk uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'API Token',
      type: 'password',
      required: true,
      helpText:
        'Your Movidesk API token. Found in Settings > Account > Parameters > Environment tab.',
    },
  ]
}

export async function exchangeCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('movidesk credentialFields require apiKey')
  return { accessToken: apiKey, extra: {} }
}
