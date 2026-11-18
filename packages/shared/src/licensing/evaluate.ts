import {
  KNOWN_FEATURES,
  verifyLicense,
  type KeyMap,
  type LicensePayload,
} from '@opensteward/license-token'
import { COMMUNITY_ENTITLEMENTS } from './community'
import { isDevKid } from './keyring'
import type { RevocationState } from './revocation-state'
import type { LicenseSource } from './source'
import { DAY_MS, classifyTime } from './time'
import type { LicenseReason, LicenseStatus } from './types'

export interface EvaluateInput {
  source: LicenseSource
  keyMap: KeyMap
  /** Rollback-protected time (LicenseStateStore.observe): classifies exp and checks nbf. */
  effectiveNowMs: number
  /** Wall-clock time of this evaluation, reported as evaluatedAt. */
  evaluatedAtMs: number
  revocations: Pick<RevocationState, 'status' | 'revoked'>
  clockRollbackDetected: boolean
}

type Base = Pick<
  LicenseStatus,
  | 'source'
  | 'filePath'
  | 'shadowedFile'
  | 'clockRollbackDetected'
  | 'revocationList'
  | 'evaluatedAt'
>
const KNOWN: ReadonlySet<string> = new Set(KNOWN_FEATURES)

export function communityStatus(
  base: Base,
  state: 'MISSING' | 'INVALID' | 'DEGRADED',
  reason?: LicenseReason,
  described: Partial<LicenseStatus> = {},
): LicenseStatus {
  return {
    ...base,
    ...described,
    state,
    ...(reason ? { reason } : {}),
    features: [...COMMUNITY_ENTITLEMENTS.features],
    limits: { ...COMMUNITY_ENTITLEMENTS.limits },
    entitlementSource: 'community',
  }
}

function describeLicense(p: LicensePayload, kid: string, nowMs: number): Partial<LicenseStatus> {
  return {
    licenseId: p.sub,
    org: p.org,
    tier: p.tier,
    ...(p.label ? { label: p.label } : {}),
    env: p.env,
    kid,
    issuedAt: p.iat,
    expiresAt: p.exp,
    daysRemaining: Math.floor((Date.parse(p.exp) - nowMs) / DAY_MS),
  }
}

/**
 * Pure. The order is the handover's §5.3: format and signature (verifyLicense,
 * including nbf), then the dev-key rule, then revocation, then time. Expiry is
 * never a verification failure: GRACE needs an authentic expired token. An
 * effective time outside the Date range is EVALUATION_FAILED, before any of it.
 */
export function evaluateLicense(input: EvaluateInput): LicenseStatus {
  const { source } = input
  const base: Base = {
    source: source.kind === 'env' ? 'env' : source.kind === 'none' ? 'none' : 'file',
    ...(source.kind === 'env'
      ? source.shadowedFile
        ? { shadowedFile: source.shadowedFile }
        : {}
      : { filePath: source.path }),
    clockRollbackDetected: input.clockRollbackDetected,
    revocationList: input.revocations.status,
    evaluatedAt: new Date(input.evaluatedAtMs).toISOString(),
  }
  if (source.kind === 'none') return communityStatus(base, 'MISSING')
  if (source.kind === 'error') return communityStatus(base, 'INVALID', source.reason)
  // A time with no Date (a corrupted license_state.max_seen_at puts the effective
  // time past 8.64e15 ms) is not the token's fault: verify would call it MALFORMED.
  if (Number.isNaN(new Date(input.effectiveNowMs).getTime()))
    return communityStatus(base, 'INVALID', 'EVALUATION_FAILED')
  const verdict = verifyLicense(source.token, input.keyMap, new Date(input.effectiveNowMs))
  if (!verdict.ok) return communityStatus(base, 'INVALID', verdict.reason)
  const { payload, kid } = verdict
  const described = describeLicense(payload, kid, input.effectiveNowMs)
  // The dev1 private key is public: a development key may only ever sign a dev license.
  if (isDevKid(kid) && payload.env !== 'dev')
    return communityStatus(base, 'INVALID', 'DEV_KEY_ENV_MISMATCH', described)
  if (input.revocations.revoked.has(payload.sub))
    return communityStatus(base, 'INVALID', 'REVOKED', described)
  const time = classifyTime(Date.parse(payload.exp), input.effectiveNowMs)
  if (time === 'DEGRADED') return communityStatus(base, 'DEGRADED', 'EXPIRED', described)
  return {
    ...base,
    ...described,
    state: time,
    features: payload.features.filter((f) => KNOWN.has(f)),
    limits: { connections: payload.limits.connections, tenants: payload.limits.tenants },
    entitlementSource: 'license',
  }
}
