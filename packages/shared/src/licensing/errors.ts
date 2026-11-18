import { LICENSE_RENEWAL_URL, LICENSE_SIGNUP_URL } from './urls'
import type { LicenseLimitKey, LicenseStatus } from './types'

export const LICENSE_ERROR_CODES = Object.freeze({
  FEATURE_NOT_ENTITLED: 'LICENSE_FEATURE_NOT_ENTITLED',
  EXPIRED: 'LICENSE_EXPIRED',
  LIMIT_EXCEEDED: 'LICENSE_LIMIT_EXCEEDED',
  STATUS_UNAVAILABLE: 'LICENSE_STATUS_UNAVAILABLE',
} as const)
export type LicenseErrorCode = (typeof LICENSE_ERROR_CODES)[keyof typeof LICENSE_ERROR_CODES]

/** The one envelope (handover §5.5): `{ error: { code, message, ...details } }`. Never `{error: "text"}`. */
export interface LicenseErrorBody {
  error: { code: LicenseErrorCode; message: string } & Record<string, unknown>
}

export function licenseErrorBody(
  code: LicenseErrorCode,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): LicenseErrorBody {
  return { error: { ...details, code, message } }
}

/** A brand, not instanceof: a second copy of this module (two installs of shared) still recognises it. */
const LICENSE_ERROR_BRAND = Symbol.for('opensteward.LicenseError')

/**
 * A license refusal. `statusCode` and `code` make attachAdapterErrorHandler
 * answer the structured 403 even where no route catches it.
 */
export class LicenseError extends Error {
  readonly statusCode = 403
  constructor(
    readonly code: LicenseErrorCode,
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message)
    this.name = 'LicenseError'
    Object.defineProperty(this, LICENSE_ERROR_BRAND, { value: true })
  }
  toBody(): LicenseErrorBody {
    return licenseErrorBody(this.code, this.message, this.details)
  }
}

export function isLicenseError(err: unknown): err is LicenseError {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as Record<PropertyKey, unknown>)[LICENSE_ERROR_BRAND] === true
  )
}

/** A feature (`mcp`, `vertical:<v>`, …) the current status does not grant. */
export function featureRefusal(
  status: Pick<LicenseStatus, 'state'>,
  feature: string,
): LicenseError {
  const C = LICENSE_ERROR_CODES
  if (status.state === 'DEGRADED')
    return new LicenseError(C.EXPIRED, `Renew at ${LICENSE_RENEWAL_URL}`, { feature })
  if (status.state === 'MISSING' || status.state === 'INVALID') {
    return new LicenseError(
      C.FEATURE_NOT_ENTITLED,
      `This deployment has no valid license, and '${feature}' is not part of community mode. Get a free license at ${LICENSE_SIGNUP_URL}`,
      { feature },
    )
  }
  return new LicenseError(
    C.FEATURE_NOT_ENTITLED,
    `This deployment's license does not include '${feature}'. See ${LICENSE_RENEWAL_URL}`,
    { feature },
  )
}

const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`
const exist = (n: number): string => `${n} ${n === 1 ? 'exists' : 'exist'}`

/** Who set the limit: a license, or community mode (no usable license, so no "license" in the text). */
type LimitSource = LicenseStatus['entitlementSource']

/** The one LICENSE_LIMIT_EXCEEDED shape (canonical): `{code, message, limitKey, limit, used}`. */
export function limitRefusal(
  key: LicenseLimitKey,
  limit: number,
  used: number,
  from: LimitSource = 'license',
): LicenseError {
  const community = from === 'community'
  const connections = community
    ? `This deployment runs in community mode, which allows ${plural(limit, 'connection')}, and`
    : `This deployment's license allows ${plural(limit, 'connection')} and`
  const message =
    key === 'connections'
      ? `${connections} ${exist(used)}. Existing connections keep working and nothing is deleted. To replace one: export its data, delete it, then reconnect. For more connections: ${LICENSE_RENEWAL_URL}`
      : `${community ? 'Community mode' : 'This license'} allows ${plural(limit, 'tenant')}, counting 'default' (${used} registered). Existing tenants keep working. More tenants need a plan that includes them: ${LICENSE_RENEWAL_URL}`
  return new LicenseError(LICENSE_ERROR_CODES.LIMIT_EXCEEDED, message, {
    limitKey: key,
    limit,
    used,
  })
}

/** A write on a connection beyond the limit (P6): reads and syncs still work, nothing is deleted. */
export function connectionReadOnlyRefusal(
  connectionId: string,
  limit: number,
  used: number,
  from: LimitSource = 'license',
): LicenseError {
  const allows = from === 'community' ? 'community mode allows' : 'its license allows'
  return new LicenseError(
    LICENSE_ERROR_CODES.LIMIT_EXCEEDED,
    `Connection ${connectionId} is read-only: this deployment has ${plural(used, 'connection')} and ${allows} ${limit}. Reads and syncs still work; nothing was deleted. To free a slot: export a connection's data, delete it, then reconnect. For more connections: ${LICENSE_RENEWAL_URL}`,
    { limitKey: 'connections', limit, used, connectionId },
  )
}

/**
 * The body for an UNAUTHENTICATED caller (GET /auth/:v/:p/connect, the OAuth
 * callback): the code and a generic message only. No limit, count, feature or
 * license state; log the full error server-side.
 */
export function publicRefusalBody(err: LicenseError): LicenseErrorBody {
  const message =
    err.code === LICENSE_ERROR_CODES.LIMIT_EXCEEDED
      ? "This deployment cannot add another connection. An operator can free a slot (export a connection's data, delete it, then reconnect) or raise the limit."
      : 'This deployment cannot connect this platform. Ask its operator.'
  return licenseErrorBody(err.code, message)
}
