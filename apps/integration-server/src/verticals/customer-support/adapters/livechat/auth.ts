/**
 * LiveChat (Text platform) authentication.
 *
 * The adapter connects with a Personal Access Token (PAT) created in the
 * Developer Console. A PAT is sent with the Basic scheme: the base64 of
 * `account_id:personal_access_token`, as `Authorization: Basic <base64>`.
 * No OAuth redirect flow is implemented.
 *
 * Docs: https://platform.text.com/docs/authorization/personal-access-tokens
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('livechat uses personal access token auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'accountId',
      label: 'Account ID',
      type: 'text',
      required: true,
      helpText: 'Your LiveChat account ID, shown next to the token in the Developer Console.',
    },
    {
      name: 'personalAccessToken',
      label: 'Personal access token',
      type: 'password',
      required: true,
      helpText: 'A personal access token created in the LiveChat Developer Console.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const accountId = (fields?.['accountId'] ?? '').trim()
  const token = (fields?.['personalAccessToken'] ?? '').trim()
  if (!accountId || !token) {
    throw new Error('livechat requires an account ID and a personal access token')
  }
  // Stored pre-encoded; the client sends it as `Authorization: Basic <accessToken>`.
  return {
    accessToken: Buffer.from(`${accountId}:${token}`).toString('base64'),
    extra: {},
  }
}
