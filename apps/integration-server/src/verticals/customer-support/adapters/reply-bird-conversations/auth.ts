/**
 * Bird auth — static API key sent as a bearer token.
 *
 * https://bird.com/docs/guides/authentication:
 *   "Every programmatic request to the Bird API authenticates with an API key
 *    passed as a bearer token. Keys belong to a workspace, carry permissions
 *    you can change, and are shown in full exactly once."
 *   "Create keys in the dashboard under **Platform tools** > **API keys**."
 *
 * The key is bound to its workspace, so no workspace id is needed. Scopes
 * (same guide): contacts need `email_marketing` at `read` level ("Read contacts,
 * audiences, and broadcasts"); tickets, messages and tags need `mailbox` at
 * `read` level ("Read mailboxes, threads, and messages").
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import { API_KEY_PATTERN } from './constants'

export function getAuthUrlUnsupported(): never {
  throw new Error('Bird uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'API key (bk_us1_… or bk_eu1_…)', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('Bird credentialFields require apiKey')
  if (!API_KEY_PATTERN.test(apiKey)) {
    throw new Error('Bird API keys start with bk_us1_ or bk_eu1_ (the prefix names the region)')
  }
  return { accessToken: apiKey }
}
