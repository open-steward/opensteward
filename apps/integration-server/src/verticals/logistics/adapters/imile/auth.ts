import type { CredentialField, Credentials } from '@opensteward/shared'
import { RECONNECT_MESSAGE, signedPost, signingKeys, type IMileSigningKeys } from './client'
import { IMILE_GRANT_TYPE, IMILE_TOKEN_PATH } from './constants'

/**
 * iMile authentication.
 *
 * "Access Token", POST /auth/accessToken/grant
 * (https://developer.imile.com/apis/details/1825742952067575809):
 *   "When you first call this API, it checks your credentials (Customer ID and
 *    the Sign Key) and returns an access token if the information is valid."
 *   "Note: Token expires every Two hours once it's generated."
 * Its response is `data.accessToken` and `data.expiresIn` (example 7200).
 *
 * The Customer ID and Sign Key are collected per connection through the
 * credential form and kept on `credentials.extra`, so refreshCredentials can
 * re-grant when `expiresAt` approaches. There is no redirect flow.
 */

const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'customerId',
    label: 'Customer ID',
    type: 'text',
    placeholder: 'C2102192601',
    helpText:
      'Your iMile client code. iMile: "Please contact iMile team to get your CustomerID and APIKey".',
    required: true,
  },
  {
    name: 'signKey',
    label: 'Sign Key',
    type: 'password',
    helpText:
      'The key iMile issued with your Customer ID (the "APIKey"), used to sign every request.',
    required: true,
  },
]

export function credentialFields(): CredentialField[] {
  return CREDENTIAL_FIELDS
}

interface IMileAccessToken {
  accessToken?: string | null
  expiresIn?: number | null
}

async function grant(keys: IMileSigningKeys): Promise<Credentials> {
  const res = await signedPost<IMileAccessToken>(IMILE_TOKEN_PATH, keys, undefined, {
    grantType: IMILE_GRANT_TYPE,
  })
  const accessToken = res.data?.accessToken
  const expiresIn = res.data?.expiresIn
  if (typeof accessToken !== 'string' || !accessToken || typeof expiresIn !== 'number') {
    throw new Error('iMile token grant returned no data.accessToken and data.expiresIn')
  }
  return {
    accessToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    extra: { customerId: keys.customerId, signKey: keys.signKey },
  }
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const customerId = (fields['customerId'] ?? '').trim()
  const signKey = (fields['signKey'] ?? '').trim()
  if (!customerId) throw new Error('Customer ID is required.')
  if (!signKey) throw new Error('Sign Key is required.')
  return grant({ customerId, signKey })
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const keys = signingKeys(credentials)
  if (!keys) throw new Error(RECONNECT_MESSAGE)
  return grant(keys)
}

export function getAuthUrl(_state: string): never {
  throw new Error(
    'iMile has no OAuth redirect: connect it through the credential form (Customer ID and Sign Key)',
  )
}
