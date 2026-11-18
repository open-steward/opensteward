/**
 * Visma Sign request authentication (https://sign.visma.net/api/docs/v1/,
 * "Authentication"):
 *
 *   "Your Visma Sign API credentials consist of a public client identifier
 *   (UUIDv4), and a secret key (32 bytes, delivered base64 encoded).
 *   Organization level request authentication is done with a Amazon-style HMAC"
 *
 *   Content-MD5: base64(md5(body)), RFC 1864 (binary md5)
 *   Content-Type: 'application/json'
 *   Date: 'Mon, 07 Dec 2015 22:57:52 +0200' (RFC 2822)
 *   Authorization: 'Onnistuu ' + client_identifier + ':' +
 *       base64(sha512_hmac(join('\n', [http_verb, Content-MD5, Content-Type,
 *       Date, http_path]), key))   // "key // in binary, remember to decode base64"
 *
 * There is no token exchange: the pair is entered once on the Connect form
 * and every request is signed with it. The secret is stored as `accessToken`
 * (the value the credential store encrypts and the pager fingerprints), the
 * identifier in `extra.clientIdentifier`.
 */
import { createHash, createHmac } from 'node:crypto'
import type { Credentials, CredentialField } from '@opensteward/shared'

const NOT_OAUTH =
  'Visma Sign signs each request with an API client identifier and secret; use credentialFields() instead'

/** The documented Content-Type; the adapter sends only JSON or empty bodies. */
export const CONTENT_TYPE = 'application/json'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function oauthUnsupported(): never {
  throw new Error(NOT_OAUTH)
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'clientIdentifier',
      label: 'Client identifier',
      type: 'text',
      required: true,
      placeholder: 'ddf58116-6082-4bfc-a775-0c0bb2f945ce',
      helpText:
        'The public client identifier (a UUID) of your Visma Sign API credentials. API access is requested from kumppanit.sign@visma.com.',
    },
    {
      name: 'secret',
      label: 'Secret key',
      type: 'password',
      required: true,
      helpText: 'The secret key of your Visma Sign API credentials, exactly as delivered (base64).',
    },
  ]
}

/**
 * Decode the delivered secret; it must be base64 of exactly 32 bytes. Only a
 * string that re-encodes to itself is the canonical base64 Visma delivered.
 */
function decodeSecret(secret: string): Buffer | undefined {
  const key = Buffer.from(secret, 'base64')
  return key.length === 32 && key.toString('base64') === secret ? key : undefined
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const clientIdentifier = (fields['clientIdentifier'] ?? '').trim()
  const secret = (fields['secret'] ?? '').trim()
  if (!clientIdentifier) throw new Error('Visma Sign credentials require the client identifier')
  if (!secret) throw new Error('Visma Sign credentials require the secret key')
  if (!UUID.test(clientIdentifier)) {
    throw new Error('Visma Sign client identifier must be a UUID')
  }
  if (!decodeSecret(secret)) {
    throw new Error('Visma Sign secret key must be the base64 encoding of 32 bytes, as delivered')
  }
  return { accessToken: secret, extra: { clientIdentifier } }
}

/**
 * The signing pair of a connection; throws when it was not made through the
 * form (a connection from the old Visma Connect OAuth flow has no identifier).
 * Format is checked once, by `exchangeCredentials`.
 */
export function vismaSignKeys(credentials: Credentials): {
  clientIdentifier: string
  secret: string
} {
  const clientIdentifier = credentials.extra?.['clientIdentifier']
  const secret = credentials.accessToken
  if (typeof clientIdentifier !== 'string' || clientIdentifier === '' || !secret) {
    throw Object.assign(
      new Error(
        'Visma Sign credentials lack the API client identifier and secret key; reconnect with both',
      ),
      { statusCode: 401, code: 'UNAUTHORIZED' },
    )
  }
  return { clientIdentifier, secret }
}

export interface SignInput {
  method: string
  /** Path and query exactly as sent, e.g. `/api/v1/document/?category=all&offset=0`. */
  path: string
  /** The exact request body; `''` when there is none. */
  body: string
  /** RFC 2822 date, sent verbatim as the `Date` header. */
  date: string
  clientIdentifier: string
  /** The base64 secret as delivered. */
  secret: string
}

/** The four documented "Required headers" for one request. */
export function signVismaSignRequest(input: SignInput): Record<string, string> {
  const contentMd5 = createHash('md5').update(input.body).digest('base64')
  const toSign = [
    input.method.toUpperCase(),
    contentMd5,
    CONTENT_TYPE,
    input.date,
    input.path,
  ].join('\n')
  const mac = createHmac('sha512', Buffer.from(input.secret, 'base64'))
    .update(toSign)
    .digest('base64')
  return {
    'Content-MD5': contentMd5,
    'Content-Type': CONTENT_TYPE,
    Date: input.date,
    Authorization: `Onnistuu ${input.clientIdentifier}:${mac}`,
  }
}
