import type { VerifyFailureReason } from '@opensteward/license-token'

export const LICENSE_STATES = [
  'VALID',
  'EXPIRING',
  'GRACE',
  'DEGRADED',
  'INVALID',
  'MISSING',
] as const
export type LicenseState = (typeof LICENSE_STATES)[number]
export type LicenseLimitKey = 'connections' | 'tenants'
export type LicenseLimits = Readonly<Record<LicenseLimitKey, number>>

/** Why a license is INVALID: every verifier reason, plus the product's own. The docs list every one. */
export type LicenseInvalidReason =
  | VerifyFailureReason
  | 'REVOKED'
  | 'DEV_KEY_ENV_MISMATCH'
  | 'FILE_UNREADABLE'
  | 'FILE_TOO_LARGE'
  | 'FILE_EMPTY'
  | 'EVALUATION_FAILED'

export const LICENSE_INVALID_REASONS = [
  'TOO_LARGE',
  'NOT_PASETO_V4_PUBLIC',
  'MALFORMED',
  'FOOTER_INVALID',
  'UNKNOWN_KID',
  'BAD_KEY',
  'BAD_SIGNATURE',
  'PAYLOAD_NOT_JSON',
  'UNSUPPORTED_VERSION',
  'WRONG_ISSUER',
  'WRONG_AUDIENCE',
  'PAYLOAD_INVALID',
  'NOT_YET_VALID',
  'REVOKED',
  'DEV_KEY_ENV_MISMATCH',
  'FILE_UNREADABLE',
  'FILE_TOO_LARGE',
  'FILE_EMPTY',
  'EVALUATION_FAILED',
] as const satisfies readonly LicenseInvalidReason[]

// The list names every reason: a reason a new license-token release adds fails
// the build here until it is listed (and documented in docs/deployment/license.md).
type UnlistedReason = Exclude<LicenseInvalidReason, (typeof LICENSE_INVALID_REASONS)[number]>
const _everyInvalidReasonListed: [UnlistedReason] extends [never] ? true : UnlistedReason = true

export type LicenseReason = LicenseInvalidReason | 'EXPIRED'

export interface LicenseStatus {
  state: LicenseState
  /** INVALID: why. DEGRADED: 'EXPIRED'. */
  reason?: LicenseReason
  /** Where the license came from: OPENSTEWARD_LICENSE, the file, or nowhere. */
  source: 'env' | 'file' | 'none'
  /** The file read or looked for. Absent when the token came from the environment. */
  filePath?: string
  /** A license file that exists but is ignored because OPENSTEWARD_LICENSE is set (Review Focus #2). */
  shadowedFile?: string
  licenseId?: string
  org?: string
  /** Display only (D-H): never gate on it. */
  tier?: string
  label?: string
  env?: string
  kid?: string
  /** What is granted: the license's known features, or community's. */
  features: readonly string[]
  limits: LicenseLimits
  issuedAt?: string
  expiresAt?: string
  /** Whole days until exp at the effective time; negative once expired. */
  daysRemaining?: number
  entitlementSource: 'license' | 'community'
  clockRollbackDetected: boolean
  revocationList: 'ok' | 'missing' | 'invalid'
  evaluatedAt: string
}
