import type { KeyMap } from '@opensteward/license-token'
import { communityStatus, evaluateLicense } from './evaluate'
import { getKeyring } from './keyring'
import { PRODUCTION_KIDS } from './keys.production'
import { loadRevocations } from './revocation-state'
import { REVOCATION_LIST_TOKEN } from './revocations'
import { readLicenseSource, type LicenseConfig } from './source'
import type { LicenseStatus } from './types'

export interface InspectLicenseOptions {
  config: LicenseConfig
  /** Evaluate at this time (ms). Default: now. No clock-rollback store is consulted. */
  now?: number
  /** Default: this build's key ring. */
  keyMap?: KeyMap
  /** Kids that count as production for `productionKid`. Default: PRODUCTION_KIDS. */
  productionKids?: readonly string[]
}

export interface LicenseInspection extends LicenseStatus {
  /** A production kid signed this license: what doctor requires for a PASS (A2s-8). */
  productionKid: boolean
}

/**
 * The license as integration-server would see it, for `pnpm doctor`: the same
 * sources in the same order, the same rules. Opens no store, starts no watcher
 * or timer, and never throws.
 */
export function inspectLicense(opts: InspectLicenseOptions): LicenseInspection {
  const nowMs = opts.now ?? Date.now()
  const kids: readonly string[] = opts.productionKids ?? PRODUCTION_KIDS
  try {
    const keyMap = opts.keyMap ?? getKeyring()
    const status = evaluateLicense({
      source: readLicenseSource(opts.config),
      keyMap,
      effectiveNowMs: nowMs,
      evaluatedAtMs: nowMs,
      revocations: loadRevocations(REVOCATION_LIST_TOKEN, keyMap),
      clockRollbackDetected: false,
    })
    return { ...status, productionKid: status.kid !== undefined && kids.includes(status.kid) }
  } catch {
    const at = new Date(Number.isFinite(nowMs) ? nowMs : Date.now()).toISOString()
    const failed = communityStatus(
      { source: 'none', clockRollbackDetected: false, revocationList: 'missing', evaluatedAt: at },
      'INVALID',
      'EVALUATION_FAILED',
    )
    return { ...failed, productionKid: false }
  }
}
