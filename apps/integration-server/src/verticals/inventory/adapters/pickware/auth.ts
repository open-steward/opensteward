import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('pickware uses HTTP Basic auth (username + api_key); use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'shopUrl', label: 'Shopware Shop URL (e.g. https://myshop.example.com)', type: 'text', required: true },
    { name: 'username', label: 'Shopware Username', type: 'text', required: true },
    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const shopUrl = (fields['shopUrl'] ?? '').replace(/\/+$/, '')
  const username = fields['username']
  const apiKey = fields['apiKey']
  if (!shopUrl) throw new Error('pickware credentialFields require shopUrl')
  if (!username) throw new Error('pickware credentialFields require username')
  if (!apiKey) throw new Error('pickware credentialFields require apiKey')
  // Store the base64-encoded Basic credential as accessToken for use in Authorization header.
  const encoded = Buffer.from(`${username}:${apiKey}`).toString('base64')
  return { accessToken: encoded, extra: { shopUrl } }
}
