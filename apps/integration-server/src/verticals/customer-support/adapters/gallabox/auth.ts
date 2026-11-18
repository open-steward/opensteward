/**
 * Gallabox auth — API Key + API Secret pair, passed as request headers.
 *
 * The API Key is stored as `credentials.accessToken`.
 * The API Secret is stored in `credentials.extra.apiSecret`.
 *
 * Both values are delivered as request headers:
 *   apiKey: <key>
 *   apiSecret: <secret>
 *
 * Docs: https://developers.gallabox.com/getting-started/authentication
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('gallabox uses API Key + Secret auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'accountId', label: 'Account ID', type: 'text', required: true },
    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
    { name: 'apiSecret', label: 'API Secret', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const accountId = fields['accountId']
  const apiKey = fields['apiKey']
  const apiSecret = fields['apiSecret']
  if (!accountId) throw new Error('gallabox credentialFields require accountId')
  if (!apiKey) throw new Error('gallabox credentialFields require apiKey')
  if (!apiSecret) throw new Error('gallabox credentialFields require apiSecret')
  return {
    accessToken: apiKey,
    extra: { apiSecret, accountId },
  }
}
