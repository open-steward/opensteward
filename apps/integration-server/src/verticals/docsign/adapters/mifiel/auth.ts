/**
 * Mifiel authenticates with HTTP Basic auth: the reference's only security
 * scheme is `"BasicAuth": { "type": "http", "scheme": "basic" }`
 * (https://docs.mifiel.com/en/api.json) and its cURL samples send
 * `-u "$APP_ID:$APP_SECRET"`. Both values are generated at
 * app.mifiel.com/settings/access-tokens ("you will need an APP_ID and an
 * APP_SECRET").
 *
 * The APP_SECRET is stored as `accessToken` (the secret the credential store
 * encrypts and `connectionScope` fingerprints), the APP_ID in `extra.appId`.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('mifiel uses static APP_ID/APP_SECRET auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'appId',
      label: 'APP_ID',
      type: 'text',
      required: true,
      helpText: 'Generated at app.mifiel.com/settings/access-tokens; the Basic auth username.',
    },
    {
      name: 'appSecret',
      label: 'APP_SECRET',
      type: 'password',
      required: true,
      helpText: 'Generated with the APP_ID; the Basic auth password.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const appId = fields['appId']
  const appSecret = fields['appSecret']
  if (!appId || !appSecret) throw new Error('mifiel credentialFields require appId and appSecret')
  return { accessToken: appSecret, extra: { appId } }
}

/** The APP_ID of a connection; throws when it is missing. */
export function mifielAppId(credentials: Credentials): string {
  const appId = credentials.extra?.['appId']
  if (typeof appId !== 'string' || appId === '') {
    throw new Error(
      'mifiel credentials lack the APP_ID (the Basic auth username); reconnect with appId and appSecret',
    )
  }
  return appId
}
