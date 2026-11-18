/**
 * @opensteward/shared/licensing — the product side of OpenSteward licensing.
 *
 * integration-server is the only process that loads a license (D-A); admin-api
 * and the admin UI read GET /admin/license. No import-time side effects: no file
 * reads and no timers. Deliberately NOT exported: the key ring and the key maps.
 * scripts/check-license-keys.ts loads the compiled keyring directly; doctor uses
 * inspectLicense.
 */
export { LICENSE_INVALID_REASONS, LICENSE_STATES } from './types'
export type {
  LicenseInvalidReason,
  LicenseLimitKey,
  LicenseLimits,
  LicenseReason,
  LicenseState,
  LicenseStatus,
} from './types'
export { LICENSE_RENEWAL_URL, LICENSE_SIGNUP_URL } from './urls'
// Display only: the contract's "Unlimited" threshold, so every surface shows a large limit alike.
export { UNLIMITED_FROM, isUnlimitedLimit } from '@opensteward/license-token'
export {
  LICENSE_ERROR_CODES,
  LicenseError,
  connectionReadOnlyRefusal,
  featureRefusal,
  isLicenseError,
  licenseErrorBody,
  limitRefusal,
  publicRefusalBody,
} from './errors'
export type { LicenseErrorBody, LicenseErrorCode } from './errors'
export { COMMUNITY_ENTITLEMENTS } from './community'
export {
  DAY_MS,
  EXPIRING_WINDOW_MS,
  GRACE_PERIOD_MS,
  ROLLBACK_TOLERANCE_MS,
  classifyTime,
  computeClock,
} from './time'
export type { ClockObservation, TimeState } from './time'
export { MAX_LICENSE_FILE_BYTES, readLicenseSource } from './source'
export type { LicenseConfig, LicenseSource } from './source'
export { communityStatus, evaluateLicense } from './evaluate'
export type { EvaluateInput } from './evaluate'
export { EntitlementService } from './entitlements'
export { formatLicenseLogLine } from './log'
export type { LicenseLogLine } from './log'
export { LicenseStatusDTOSchema, toLicenseStatusDTO } from './dto'
export type { LicenseStatusDTO } from './dto'
export { inspectLicense } from './inspect'
export type { InspectLicenseOptions, LicenseInspection } from './inspect'
export { devKeysPresent, isDevKid } from './keyring'
export { PRODUCTION_KIDS } from './keys.production'
export { loadRevocations } from './revocation-state'
export type { RevocationState } from './revocation-state'
export { LICENSE_STATE_NAMESPACE, LicenseStateStore } from './state-store'
export { LICENSE_TICK_INTERVAL_MS, LicenseManager } from './manager'
export type {
  LicenseChangeListener,
  LicenseClockStore,
  LicenseLogger,
  LicenseManagerOptions,
} from './manager'
