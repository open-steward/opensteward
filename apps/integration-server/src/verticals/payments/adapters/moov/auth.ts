/**
 * Moov auth: Basic authentication with the API key pair.
 *
 * https://docs.moov.io/api/authentication/api-authentication/:
 * "Server-side: Basic authentication You can use your API key's public and
 * private keys with Basic authentication. Set the Authorization header to
 * Basic <credentials>, where credentials is the Base64 encoding of public key
 * and private key joined by a single colon :. Only use this method if you are
 * developing a server-side integration."
 *
 * The same page's OAuth section is for client-side Moov.js ("When making
 * requests to Moov from a browser, you can use OAuth with JSON Web Tokens"),
 * minting short-lived scoped tokens with client_credentials. Moov documents no
 * authorization-code flow, so there is no redirect to send a customer to.
 *
 * Every read is scoped to one Moov account: "GET /accounts/{accountID}/transfers"
 * (https://docs.moov.io/api/money-movement/transfers/list/), "Path parameters
 * accountID string required". The form therefore asks for that account ID too.
 */

import type { CredentialField, Credentials } from '@opensteward/shared'

export const MOOV_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'publicKey',
    label: 'Public key',
    type: 'text',
    required: true,
    helpText: 'Public key of a Moov API key (Dashboard → Developers → API keys).',
  },
  {
    name: 'privateKey',
    label: 'Private key',
    type: 'password',
    required: true,
    helpText: 'Private key of the same API key.',
  },
  {
    name: 'accountID',
    label: 'Account ID',
    type: 'text',
    required: true,
    helpText: 'ID of the Moov account whose transfers to read.',
  },
]

function required(fields: Record<string, string>, name: string): string {
  const value = (fields[name] ?? '').trim()
  if (!value)
    throw new Error(`Moov needs ${name}: submit the API public key, private key and account ID.`)
  return value
}

/**
 * The Basic credential (Base64 of `public:private`) is stored as `accessToken`,
 * so the client sends `Authorization: Basic <accessToken>`; the account ID goes
 * on `extra`. API keys do not expire, so there is no refresh token.
 */
export function exchangeMoovCredentials(fields: Record<string, string>): Credentials {
  const publicKey = required(fields, 'publicKey')
  const privateKey = required(fields, 'privateKey')
  const accountID = required(fields, 'accountID')
  return {
    accessToken: Buffer.from(`${publicKey}:${privateKey}`).toString('base64'),
    extra: { accountID },
  }
}

/** The connection's Moov account ID, or a refusal before any request is built. */
export function accountIdOf(credentials: Credentials): string {
  const id = credentials.extra?.['accountID']
  if (typeof id !== 'string' || id.trim() === '') {
    throw Object.assign(
      new Error(
        'Moov connection has no accountID: reconnect with the API public key, private key and account ID.',
      ),
      { statusCode: 401, code: 'RECONNECT_REQUIRED' },
    )
  }
  return id
}

export const NO_REDIRECT_FLOW =
  'Moov documents no authorization-code flow: connect with the API public and private keys (Basic authentication) and the account ID via the Connect Link form.'
