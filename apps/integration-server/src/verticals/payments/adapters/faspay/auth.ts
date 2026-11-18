/**
 * Faspay authentication — `api_key` model (no OAuth).
 *
 * Faspay does not issue bearer tokens. Every JSON REST request authenticates
 * with a per-request `signature` computed from three static merchant secrets
 * plus the per-transaction `bill_no`:
 *
 *   signature = sha1( md5( user_id + password + bill_no ) )
 *
 * The notification (webhook) signature additionally folds in the status code:
 *
 *   signature = sha1( md5( user_id + password + bill_no + payment_status_code ) )
 *
 * The merchant supplies four static values through the Connect Link form:
 *   - merchantId  → stored on `credentials.extra.merchantId` (sent in bodies)
 *   - userId      → stored on `credentials.extra.userId`     (signature input)
 *   - password    → stored on `credentials.accessToken`      (secret; signature input)
 *   - environment → stored on `credentials.extra.environment` (selects the host)
 *
 * `password` is the secret, so it rides on `accessToken`; the other three are
 * either non-secret identifiers or routing knobs and live on `extra`.
 *
 * Docs: https://docs.faspay.co.id/merchant-integration/api-reference-1/debit-transaction
 */
import { createHash } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'
import { ENVIRONMENT_BASE_URLS } from './constants'

/** The merchant password for a stored connection — the secret signature input. */
export function password(credentials: Credentials): string {
  return credentials.accessToken ?? ''
}

/** The merchant id for a stored connection — sent in every request body. */
export function merchantId(credentials: Credentials): string {
  const value = credentials.extra?.['merchantId']
  return typeof value === 'string' ? value : ''
}

/** The merchant user id for a stored connection — a signature input. */
export function userId(credentials: Credentials): string {
  const value = credentials.extra?.['userId']
  return typeof value === 'string' ? value : ''
}

/** The environment code for a stored connection — selects the API host. */
export function environment(credentials: Credentials): string {
  const value = credentials.extra?.['environment']
  return typeof value === 'string' ? value : 'sandbox'
}

/**
 * Faspay request signature: `sha1(md5(user_id + password + bill_no))`, hex.
 */
export function signRequest(userIdValue: string, passwordValue: string, billNo: string): string {
  const inner = createHash('md5').update(`${userIdValue}${passwordValue}${billNo}`).digest('hex')
  return createHash('sha1').update(inner).digest('hex')
}

/**
 * Faspay notification signature:
 * `sha1(md5(user_id + password + bill_no + payment_status_code))`, hex.
 */
export function signNotification(
  userIdValue: string,
  passwordValue: string,
  billNo: string,
  paymentStatusCode: string,
): string {
  const inner = createHash('md5')
    .update(`${userIdValue}${passwordValue}${billNo}${paymentStatusCode}`)
    .digest('hex')
  return createHash('sha1').update(inner).digest('hex')
}

const ENVIRONMENT_OPTIONS = Object.keys(ENVIRONMENT_BASE_URLS).map((value) => ({
  value,
  label: value,
}))

/**
 * Connect-form descriptor + exchange. A bespoke (vs. `simpleApiKey`) form
 * because Faspay's signature needs three static values — merchant id, user id,
 * and the secret password — plus an environment selector for the API host.
 */
export const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'merchantId',
      label: 'Merchant ID',
      type: 'text',
      required: true,
      helpText:
        'Your Faspay Merchant Code (numeric), from the Faspay Merchant Page → Settings → Credentials.',
    },
    {
      name: 'userId',
      label: 'User ID',
      type: 'text',
      required: true,
      helpText: 'Your Faspay API User ID, used together with the password to sign every request.',
    },
    {
      name: 'password',
      label: 'Password',
      type: 'password',
      required: true,
      helpText:
        'Your Faspay API password (secret). Combined with the User ID and bill number to build the SHA1(MD5(...)) request signature.',
    },
    {
      name: 'environment',
      label: 'Environment',
      type: 'select',
      required: true,
      options: ENVIRONMENT_OPTIONS,
      helpText:
        'Which Faspay environment issued your credentials. Determines the API host (sandbox → debit-sandbox.faspay.co.id, production → debit.faspay.co.id).',
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const merchant = (fields['merchantId'] ?? '').trim()
    const user = (fields['userId'] ?? '').trim()
    const pass = (fields['password'] ?? '').trim()
    const env = (fields['environment'] ?? '').trim().toLowerCase()
    if (!merchant) throw new Error('Merchant ID is required.')
    if (!user) throw new Error('User ID is required.')
    if (!pass) throw new Error('Password is required.')
    if (!ENVIRONMENT_BASE_URLS[env]) {
      throw new Error(`Unknown Faspay environment: ${env || '(empty)'}.`)
    }
    return {
      accessToken: pass,
      extra: { merchantId: merchant, userId: user, environment: env },
    }
  },
})
