/**
 * Nuvei (SafeCharge) auth — `api_key` model.
 *
 * Nuvei does not use OAuth or a bearer token. Every API call is signed with a
 * per-request SHA-256 `checksum` computed from a fixed, method-specific field
 * order followed by the `merchantSecretKey`. The merchant identifies itself
 * with three values, collected via the Connect Link form:
 *
 *   - merchantId         — numeric merchant identifier
 *   - merchantSiteId     — numeric site identifier under the merchant
 *   - merchantSecretKey  — the shared secret used to compute every checksum
 *
 * The merchant also picks the environment (sandbox vs production), which
 * selects the base URL. None of these are bearer tokens, so we stash the
 * non-secret identifiers on `credentials.extra` and keep the secret on
 * `credentials.accessToken` so it never lands in logs that print `extra`.
 *
 * Checksum: concatenate the method's required field values in the documented
 * order (no separators), append `merchantSecretKey`, then SHA-256 hex-digest.
 *
 * Docs: https://docs.nuvei.com/documentation/features/authentication/
 */
import { createHash } from 'node:crypto'
import type { Credentials, CredentialField } from '@opensteward/shared'

export interface NuveiCredentialExtra {
  merchantId: string
  merchantSiteId: string
  environment: 'sandbox' | 'production'
  /** Index signature so the extra map satisfies `Credentials.extra`. */
  [key: string]: unknown
}

export const NUVEI_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'merchantId',
    label: 'Merchant ID',
    type: 'text',
    required: true,
    helpText: 'Numeric merchant identifier from the Nuvei Control Panel.',
  },
  {
    name: 'merchantSiteId',
    label: 'Merchant Site ID',
    type: 'text',
    required: true,
    helpText: 'Numeric site identifier under your merchant account.',
  },
  {
    name: 'merchantSecretKey',
    label: 'Merchant secret key',
    type: 'password',
    required: true,
    helpText: 'Shared secret used to sign each request checksum. Keep this private.',
  },
  {
    name: 'environment',
    label: 'Environment',
    type: 'select',
    required: true,
    options: [
      { value: 'sandbox', label: 'Sandbox (ppp-test.safecharge.com)' },
      { value: 'production', label: 'Production (secure.safecharge.com)' },
    ],
  },
]

export function buildCredentials(fields: Record<string, string>): Credentials {
  const merchantId = (fields.merchantId ?? '').trim()
  const merchantSiteId = (fields.merchantSiteId ?? '').trim()
  const merchantSecretKey = (fields.merchantSecretKey ?? '').trim()
  const environment = fields.environment === 'production' ? 'production' : 'sandbox'

  if (!merchantId || !merchantSiteId || !merchantSecretKey) {
    throw new Error('Nuvei requires merchantId, merchantSiteId, and merchantSecretKey.')
  }

  const extra: NuveiCredentialExtra = { merchantId, merchantSiteId, environment }
  return { accessToken: merchantSecretKey, extra }
}

export function readExtra(credentials: Credentials): NuveiCredentialExtra {
  const extra = (credentials.extra ?? {}) as Partial<NuveiCredentialExtra>
  return {
    merchantId: extra.merchantId ?? '',
    merchantSiteId: extra.merchantSiteId ?? '',
    environment: extra.environment === 'production' ? 'production' : 'sandbox',
  }
}

/**
 * Nuvei timestamp format — `YYYYMMDDHHmmss`, in GMT by default.
 *
 * `offsetHours` shifts the wall clock for methods whose docs name another
 * zone: the rebilling methods (e.g. getPlansList) define timeStamp as "The
 * time (in 24-hour format) when the method call is performed according to the
 * GMT+2 time zone in the format: YYYYMMDDHHmmss" —
 * https://docs.nuvei.com/api/advanced/indexAdvanced.html#getplanslist
 */
export function nuveiTimestamp(date: Date = new Date(), offsetHours = 0): string {
  if (offsetHours) date = new Date(date.getTime() + offsetHours * 3_600_000)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return (
    `${date.getUTCFullYear()}` +
    `${p(date.getUTCMonth() + 1)}` +
    `${p(date.getUTCDate())}` +
    `${p(date.getUTCHours())}` +
    `${p(date.getUTCMinutes())}` +
    `${p(date.getUTCSeconds())}`
  )
}

/**
 * Compute a Nuvei request checksum: SHA-256 hex digest of the ordered field
 * values concatenated with no separators, followed by `merchantSecretKey`.
 * Empty/omitted values are dropped by the caller before they reach here.
 */
export function computeChecksum(
  orderedValues: Array<string | number>,
  merchantSecretKey: string,
): string {
  const concatenated = orderedValues.map((v) => String(v)).join('') + merchantSecretKey
  return createHash('sha256').update(concatenated, 'utf8').digest('hex')
}
