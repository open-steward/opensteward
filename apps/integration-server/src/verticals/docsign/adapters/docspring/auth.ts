/**
 * DocSpring authenticates with HTTP Basic over an API token's id and secret
 * (https://docspring.com/docs/api-guide/authentication/):
 *   "you need to send an Authorization header with the value Basic followed by
 *    token_id:token_secret in Base64 encoding."
 * The spec's only security scheme is
 *   "api_token_basic": { "type": "basic", "description": "Username: API Token ID, Password: API Token Secret" }
 * (https://docspring.com/api-docs/v1/swagger.json).
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('docspring uses static API token auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'tokenId', label: 'API Token ID', type: 'text', required: true },
    { name: 'tokenSecret', label: 'API Token Secret', type: 'password', required: true },
  ]
}

/** Stores the Basic credential, `base64(token_id:token_secret)`, as the access token. */
export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const tokenId = fields['tokenId']
  const tokenSecret = fields['tokenSecret']
  if (!tokenId) throw new Error('docspring credentialFields require tokenId')
  if (!tokenSecret) throw new Error('docspring credentialFields require tokenSecret')
  return {
    accessToken: Buffer.from(`${tokenId}:${tokenSecret}`).toString('base64'),
    extra: { tokenId },
  }
}
