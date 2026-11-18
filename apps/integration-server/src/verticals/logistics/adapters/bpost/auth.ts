/**
 * bpost authentication.
 *
 * The Shipping Manager API has no OAuth and no token endpoint. bpack
 * integration manual v3.3.35 §C.3.2.6
 * (https://bpost.freshdesk.com/helpdesk/attachments/4176380323): "The value of
 * this header is the authorization type (Basic) followed by the e-tailer's
 * external-Id concatenated with a colon and an at least 128 bits passphrase
 * (the passphrase is the password of the shipping manager webservice and can
 * be found in the admin panel of the shipping manager backend). ... The
 * External-Id is the e-tailer's Account ID." The account id is also in every
 * path: "Each service end point contains the accountId to uniquely identify
 * the resource."
 *
 * The trackingInfo web service (§E.3.4.2) takes Basic auth too, with a
 * password of its own: "The username is the Account ID. The password can be
 * requested by sending an e-mail to esolutions@bpost.be". It is optional on
 * the connection; getTrackingEvents refuses without it.
 */
import type { CredentialField, Credentials } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'
import { BPOST_ACCESS_HELP, BPOST_TRACKING_HELP } from './constants'

const FORM = customForm({
  fields: [
    {
      name: 'accountId',
      label: 'Shipping Manager account ID',
      type: 'text',
      helpText: BPOST_ACCESS_HELP,
      required: true,
    },
    {
      name: 'passphrase',
      label: 'Shipping Manager passphrase',
      type: 'password',
      helpText: BPOST_ACCESS_HELP,
      required: true,
    },
    {
      name: 'trackingPassword',
      label: 'Track & Trace web service password',
      type: 'password',
      helpText: BPOST_TRACKING_HELP,
      required: false,
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const accountId = (fields?.['accountId'] ?? '').trim()
    const passphrase = (fields?.['passphrase'] ?? '').trim()
    const trackingPassword = (fields?.['trackingPassword'] ?? '').trim()
    if (!accountId) throw new Error('Shipping Manager account ID is required.')
    if (!passphrase) throw new Error('Shipping Manager passphrase is required.')
    return {
      accessToken: passphrase,
      extra: trackingPassword ? { accountId, trackingPassword } : { accountId },
    }
  },
})

export function credentialFields(): CredentialField[] {
  return FORM.credentialFields()
}

export function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  return FORM.exchangeCredentials(fields)
}

function extraString(credentials: Credentials, key: string): string {
  const raw = credentials.extra?.[key]
  return typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : ''
}

function refuse(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/**
 * The connection's Shipping Manager account id. Every SHM path carries it, so
 * a connection without one (any made before the move off the old OAuth flow)
 * is refused before a request is sent.
 */
export function accountIdOf(credentials: Credentials): string {
  const id = extraString(credentials, 'accountId')
  if (!id) {
    throw refuse(
      'bpost needs the Shipping Manager account ID: every Shipping Manager path is ' +
        '/{accountId}/..., and it is the Basic auth username. Reconnect with your account ID and passphrase.',
    )
  }
  return id
}

/** The trackingInfo web service password, or a refusal naming it. */
export function trackingPasswordOf(credentials: Credentials): string {
  const password = extraString(credentials, 'trackingPassword')
  if (!password) {
    throw refuse(
      'bpost cannot read tracking without the trackingInfo web service password: "The username is ' +
        'the Account ID. The password can be requested by sending an e-mail to esolutions@bpost.be". ' +
        'Reconnect with the Track & Trace web service password.',
    )
  }
  return password
}

/** "Authorization: Basic External-Id:passphrase — Where the underlined value is encoded in Base64." */
export function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}
