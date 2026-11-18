/**
 * Document360 authentication — static API token model.
 *
 * Every request must include the token in the `api_token` request header.
 * Tokens are project-scoped; generate one at:
 *   Settings → Knowledge base portal → API Tokens
 *
 * Docs: https://apidocs.document360.com/apidocs/api-token
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('document360 uses static API token auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiToken',
      label: 'API Token',
      type: 'password',
      required: true,
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiToken = fields['apiToken']
  if (!apiToken) throw new Error('document360 credentialFields require apiToken')
  return { accessToken: apiToken, extra: {} }
}
