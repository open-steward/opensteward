import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('connectpos uses a Bearer JWT token; use credentialFields() instead')
}

/**
 * ConnectPOS stores its JWT access token (obtained from the Magento Admin or
 * via POST /xrest/index/v1?path=token) as the api_key. The storeUrl is the
 * base URL of the Magento 2 installation, e.g. https://mystore.example.com
 */
export function credentialFields(): CredentialField[] {
  return [
    { name: 'storeUrl', label: 'Magento Store URL', type: 'text', required: true },
    { name: 'apiKey', label: 'Access Token (JWT)', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const storeUrl = (fields['storeUrl'] ?? '').replace(/\/+$/, '')
  const apiKey = fields['apiKey']
  if (!storeUrl) throw new Error('connectpos credentialFields require storeUrl')
  if (!apiKey) throw new Error('connectpos credentialFields require apiKey')
  return { accessToken: apiKey, extra: { storeUrl } }
}
