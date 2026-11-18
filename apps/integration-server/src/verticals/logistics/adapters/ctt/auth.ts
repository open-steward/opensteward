/**
 * CTT (Pakketmail) authentication.
 *
 * https://api.pakketmail.nl/v3/apidocs/usa/authenticate:
 *
 *   "Authenticating any request is done by using basic http authentication,
 *    but instead of the normal username and password the api expects the
 *    'username' to be the public or token key and the 'password' to be a hash
 *    that is calculated to verify the data. ... the public key is only used to
 *    obtain a token key. This token key is used in every other request."
 *
 *   "Put the data (json, document, etc) that is about to be sent in 1 string.
 *    An empty string is also valid. Prepend the token (or public key) to this
 *    string. Calculate the hash by using hmac sha256 using the secret key,
 *    making sure the outcome is a base64 encoded string. ... Make sure the
 *    hash has no padding at the end. If it has, remove it."
 *
 * https://api.pakketmail.nl/v3/apidocs/usa/using ("Request headers"):
 *
 *   "X-APPID Yes This is the application key, it identifies your
 *    application/plugin."
 *
 * A token comes from POST /keys/
 * (https://api.pakketmail.nl/v3/apidocs/usa/endpoints/keys/POST), whose body
 * is PlatformVersion, PluginVersion and ShopUrl, all required, and whose reply
 * is `Key` ("The new token/key to use") and `Expire` ("The expiration date of
 * the token"). "For the first time fetching a token, the ShopUrl can be any
 * valid URL. But with any concurrent token request, this url has to match the
 * already registered one." So the ShopUrl is part of the connection.
 */
import { createHmac } from 'crypto'
import axios from 'axios'
import type { CredentialField } from '@opensteward/shared'
import type { Credentials } from '../../adapter/interface'
import {
  CTT_API_BASE,
  CTT_DASHBOARD_URL,
  CTT_PLATFORM_VERSION,
  CTT_PLUGIN_VERSION,
} from './constants'

/** The four values a CTT connection needs, all issued by CTT / chosen by the customer. */
export interface CttKeys {
  /** Application key, sent as the X-APPID header. */
  appId: string
  /** Public key: the HTTP username on POST /keys/ only. */
  publicKey: string
  /** Secret key: the HMAC-SHA256 key for every request. */
  secretKey: string
  /** The shop URL registered with the first token request. */
  shopUrl: string
}

const KEY_FIELDS = ['appId', 'publicKey', 'secretKey', 'shopUrl'] as const

export const CTT_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'appId',
    label: 'Application key (X-APPID)',
    type: 'password',
    helpText: 'The API application key CTT registered for your integration.',
    required: true,
  },
  {
    name: 'publicKey',
    label: 'Public key',
    type: 'text',
    helpText: 'Created on the key management page of the CTT e-commerce application.',
    required: true,
  },
  {
    name: 'secretKey',
    label: 'Secret key',
    type: 'password',
    helpText: 'Created with the public key on the key management page.',
    required: true,
  },
  {
    name: 'shopUrl',
    label: 'Shop URL',
    type: 'url',
    helpText:
      'The shop URL registered with the first token request for these keys. Every later token request must send the same URL.',
    required: true,
  },
]

/** Base64 HMAC-SHA256 of `user + body` under `secret`, with the `=` padding removed. */
export function hmacPassword(user: string, body: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(user + body)
    .digest('base64')
    .replace(/=+$/, '')
}

export function basicAuthHeader(user: string, body: string, secret: string): string {
  const password = hmacPassword(user, body, secret)
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`
}

/** The keys stored on a connection, or a 401 telling the caller to reconnect. */
export function readKeys(credentials: Pick<Credentials, 'extra'>): CttKeys {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const missing = KEY_FIELDS.filter((k) => typeof extra[k] !== 'string' || extra[k] === '')
  if (missing.length > 0) {
    throw Object.assign(
      new Error(
        `CTT connection is missing ${missing.join(', ')}: reconnect with the application key, public key, secret key and shop URL.`,
      ),
      { statusCode: 401, code: 'UNAUTHORIZED' },
    )
  }
  return {
    appId: extra['appId'] as string,
    publicKey: extra['publicKey'] as string,
    secretKey: extra['secretKey'] as string,
    shopUrl: extra['shopUrl'] as string,
  }
}

export interface CttKeysResponse {
  Key?: string
  Expire?: string
  Error?: { Id: number; Info?: string }
  ErrorList?: Array<{ Id: number; Tekst?: string }>
}

/** POST /keys/ under the public key: a fresh token and its expiry. */
export async function requestToken(keys: CttKeys): Promise<{ token: string; expiresAt?: Date }> {
  const body = JSON.stringify({
    PlatformVersion: CTT_PLATFORM_VERSION,
    PluginVersion: CTT_PLUGIN_VERSION,
    ShopUrl: keys.shopUrl,
  })
  const { data } = await axios.post<CttKeysResponse>(`${CTT_API_BASE}keys/`, body, {
    headers: {
      Authorization: basicAuthHeader(keys.publicKey, body, keys.secretKey),
      'X-APPID': keys.appId,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  })
  if (!data?.Key) {
    const info = data?.Error?.Info ?? data?.ErrorList?.[0]?.Tekst ?? 'no Key in the reply'
    throw Object.assign(new Error(`CTT token request failed: ${info}`), {
      statusCode: 401,
      code: 'UNAUTHORIZED',
    })
  }
  const expiresAt = data.Expire ? new Date(data.Expire) : undefined
  return {
    token: data.Key,
    expiresAt: expiresAt && !isNaN(expiresAt.getTime()) ? expiresAt : undefined,
  }
}

export async function exchangeKeyFields(fields: Record<string, string>): Promise<Credentials> {
  const extra: Record<string, string> = {}
  for (const f of CTT_CREDENTIAL_FIELDS) {
    const value = (fields?.[f.name] ?? '').trim()
    if (!value) throw new Error(`${f.label} is required.`)
    extra[f.name] = value
  }
  const keys = readKeys({ extra })
  const { token, expiresAt } = await requestToken(keys)
  return { accessToken: token, expiresAt, extra }
}

export function buildAuthUrl(_state: string): string {
  return CTT_DASHBOARD_URL
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const keys = readKeys(credentials)
  const { token, expiresAt } = await requestToken(keys)
  return { ...credentials, accessToken: token, expiresAt }
}
