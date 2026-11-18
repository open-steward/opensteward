/**
 * Bridge credentials.
 *
 * Bridge authenticates an application with two headers, not an OAuth grant.
 * https://docs.bridgeapi.io/docs/basics.md: "Our API implements following
 * HTTP headers on every endpoint: `Client-Id` - Your Bridge application client
 * id ... `Client-Secret` - Your Bridge application client secret". The
 * payment-account and payment-request operations declare exactly that
 * security (`clientIdAuth` + `clientSecretAuth`, both `in: header`).
 *
 * The client secret is stored as `credentials.accessToken`, the client id on
 * `credentials.extra.clientId`.
 */

import type { Credentials } from '@opensteward/shared'

export function buildCredentials(fields: Record<string, string>): Credentials {
  const clientId = (fields.clientId ?? '').trim()
  const clientSecret = (fields.clientSecret ?? '').trim()
  if (!clientId) throw new Error('Bridge client id is required.')
  if (!clientSecret) throw new Error('Bridge client secret is required.')
  return { accessToken: clientSecret, extra: { clientId } }
}

/** The Client-Id / Client-Secret pair a connection carries, or a thrown error naming what is missing. */
export function readAppCredentials(credentials: Credentials): {
  clientId: string
  clientSecret: string
} {
  const clientId = (credentials.extra as Record<string, unknown> | undefined)?.clientId
  if (typeof clientId !== 'string' || clientId === '') {
    throw Object.assign(
      new Error(
        'Bridge connection has no client id; reconnect with the Client-Id and Client-Secret of your Bridge application.',
      ),
      { statusCode: 401, code: 'MISSING_CREDENTIALS' },
    )
  }
  if (!credentials.accessToken) {
    throw Object.assign(
      new Error(
        'Bridge connection has no client secret; reconnect with the Client-Id and Client-Secret of your Bridge application.',
      ),
      { statusCode: 401, code: 'MISSING_CREDENTIALS' },
    )
  }
  return { clientId, clientSecret: credentials.accessToken }
}
