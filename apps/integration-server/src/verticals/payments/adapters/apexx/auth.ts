/**
 * APEXX Global authenticates every request with a static API key sent in the
 * `x-apikey` HTTP header — there is no OAuth flow. The key (together with an
 * `account` id) is issued by the merchant's APEXX Implementation Manager and
 * submitted through the Connect Link form.
 *
 * APEXX also requires an `account` id on most request bodies. We collect it on
 * the same form and stash it on `credentials.extra.account` so the client and
 * resource methods can echo it back. The API key itself is stored as the
 * `accessToken` and rendered into the `x-apikey` header by the client.
 *
 * Docs: https://support.apexx.global/support/solutions/articles/19000111097-apexx-api-reference
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'apiKey',
    label: 'API key',
    type: 'password',
    required: true,
    helpText:
      'The x-apikey value issued by your APEXX Implementation Manager. Sent in the x-apikey header of every request.',
  },
  {
    name: 'account',
    label: 'Account ID',
    type: 'text',
    required: true,
    helpText: 'Your APEXX account id, included on transaction requests.',
  },
]

export function buildCredentials(fields: Record<string, string>): Credentials {
  const apiKey = (fields.apiKey ?? '').trim()
  if (!apiKey) throw new Error('API key is required.')
  const account = (fields.account ?? '').trim()
  if (!account) throw new Error('Account ID is required.')
  return { accessToken: apiKey, extra: { account } }
}
