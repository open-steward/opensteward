/**
 * Signhost authenticates every request with two headers
 * (https://developer.signhost.com/guide/features/authentication.md):
 *   "To authenticate your requests, you must add two HTTP headers to every
 *   request."
 *   | `Application`   | `APPKey {appkey token}`    | Application Key |
 *   | `Authorization` | `APIKey {your user token}` | User Token      |
 *
 * The user token is stored as `accessToken` (the secret the credential store
 * encrypts), the application key in `extra.appKey`.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('signhost uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'appKey',
      label: 'Application key (APPKey)',
      type: 'password',
      required: true,
      helpText: 'Sent as the Application header: "APPKey {appkey token}".',
    },
    {
      name: 'userToken',
      label: 'User token (APIKey)',
      type: 'password',
      required: true,
      helpText: 'Sent as the Authorization header: "APIKey {your user token}".',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const appKey = fields['appKey']
  const userToken = fields['userToken']
  if (!appKey || !userToken) {
    throw new Error('signhost credentialFields require appKey and userToken')
  }
  return { accessToken: userToken, extra: { appKey } }
}

/** The application key (APPKey) of a connection; throws when it is missing. */
export function signhostAppKey(credentials: Credentials): string {
  const appKey = credentials.extra?.['appKey']
  if (typeof appKey !== 'string' || appKey === '') {
    throw new Error(
      'signhost credentials lack the application key (APPKey); reconnect with appKey and userToken',
    )
  }
  return appKey
}
