/**
 * Helpjuice authentication — API key model.
 *
 * The API key is passed as the Authorization header (raw key, no Bearer prefix).
 * The account subdomain is required to build the per-tenant base URL.
 *
 * Settings: https://<account>.helpjuice.com/admin/settings/api_credentials
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('helpjuice uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'account',
      label: 'Account Subdomain',
      type: 'text',
      required: true,
    },
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const account = fields['account']
  const apiKey = fields['apiKey']
  if (!account) throw new Error('helpjuice credentialFields require account subdomain')
  if (!apiKey) throw new Error('helpjuice credentialFields require apiKey')
  return {
    accessToken: apiKey,
    extra: { account },
  }
}
