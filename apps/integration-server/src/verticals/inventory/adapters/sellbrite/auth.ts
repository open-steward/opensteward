/**
 * Sellbrite auth — Basic HTTP (account_token:secret_key).
 * Credentials are static; no OAuth2 flow.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('sellbrite uses Basic HTTP auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'accountToken', label: 'Account Token', type: 'text', required: true },
    { name: 'secretKey', label: 'Secret Key', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const accountToken = fields['accountToken']
  const secretKey = fields['secretKey']
  if (!accountToken || !secretKey) {
    throw new Error('sellbrite requires accountToken and secretKey')
  }
  // Encode as Base64 for Basic auth: "<accountToken>:<secretKey>"
  const encoded = Buffer.from(`${accountToken}:${secretKey}`).toString('base64')
  return { accessToken: encoded, extra: { accountToken } }
}
