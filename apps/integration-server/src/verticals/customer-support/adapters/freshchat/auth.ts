/**
 * Freshchat auth — static API key (Bearer token).
 *
 * Tokens are obtained from Admin > API Tokens in the Freshchat dashboard.
 * The account domain (e.g. "mycompany.freshchat.com") is required to build
 * the base URL; it is stored in credentials.extra.accountDomain.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('freshchat uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'API Token', type: 'password', required: true },
    {
      name: 'accountDomain',
      label: 'Account Domain (e.g. mycompany.freshchat.com)',
      type: 'text',
      required: true,
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  const accountDomain = fields['accountDomain']
  if (!apiKey) throw new Error('freshchat credentialFields require apiKey')
  if (!accountDomain) throw new Error('freshchat credentialFields require accountDomain')
  return {
    accessToken: apiKey,
    extra: { accountDomain: accountDomain.replace(/^https?:\/\//, '').replace(/\/.*$/, '') },
  }
}
