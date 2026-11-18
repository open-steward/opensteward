import { describe, expect, it } from 'vitest'
import { evaluateLicense, type EvaluateInput } from '../../src/licensing/evaluate'
import { COMMUNITY_ENTITLEMENTS } from '../../src/licensing/community'
import { EXPIRING_WINDOW_MS, GRACE_PERIOD_MS } from '../../src/licensing/time'
import {
  DAY,
  DEV_KEYMAP,
  DEV_KID,
  T0,
  iso,
  payload,
  productionTestKey,
  signLicense,
  tamper,
} from './helpers'

const EXP = T0 + 365 * DAY
const NO_REVOCATIONS: EvaluateInput['revocations'] = { status: 'missing', revoked: new Set() }

function run(over: Partial<EvaluateInput> & { token?: string } = {}) {
  const { token, ...rest } = over
  return evaluateLicense({
    source: { kind: 'env', token: token ?? signLicense() },
    keyMap: DEV_KEYMAP,
    effectiveNowMs: T0,
    evaluatedAtMs: T0,
    revocations: NO_REVOCATIONS,
    clockRollbackDetected: false,
    ...rest,
  })
}

describe('evaluateLicense', () => {
  it('VALID grants exactly its known features and its limits; unknown well-formed features are ignored (D-D)', () => {
    const s = run({
      token: signLicense(
        payload({ features: ['mcp', 'vertical:crm', 'sso', 'vertical:not-shipped-yet'] }),
      ),
    })
    expect(s).toMatchObject({
      state: 'VALID',
      entitlementSource: 'license',
      features: ['mcp', 'vertical:crm', 'sso'],
      limits: { connections: 5, tenants: 1 },
      licenseId: 'lic_test0001',
      org: 'Acme Forsakring AB',
      label: 'production',
      tier: 'free',
      env: 'dev',
      kid: DEV_KID,
      daysRemaining: 365,
      source: 'env',
    })
  })

  it.each([
    ['VALID', EXP - EXPIRING_WINDOW_MS - 1],
    ['EXPIRING', EXP - EXPIRING_WINDOW_MS],
    ['GRACE', EXP],
    ['GRACE', EXP + GRACE_PERIOD_MS - 1],
    ['DEGRADED', EXP + GRACE_PERIOD_MS],
  ] as const)('%s at the boundary', (state, now) => {
    expect(run({ effectiveNowMs: now }).state).toBe(state)
  })

  it('GRACE keeps the license entitlements; DEGRADED is community but still names the license', () => {
    expect(run({ effectiveNowMs: EXP }).entitlementSource).toBe('license')
    const s = run({ effectiveNowMs: EXP + GRACE_PERIOD_MS })
    expect(s).toMatchObject({
      state: 'DEGRADED',
      reason: 'EXPIRED',
      entitlementSource: 'community',
      org: 'Acme Forsakring AB',
    })
    expect(s.features).toEqual(COMMUNITY_ENTITLEMENTS.features)
    expect(s.limits).toEqual(COMMUNITY_ENTITLEMENTS.limits)
  })

  it('classifies against the effective (rollback-protected) time, not the wall clock', () => {
    expect(run({ effectiveNowMs: EXP + GRACE_PERIOD_MS, evaluatedAtMs: T0 }).state).toBe('DEGRADED')
  })

  it('[L7:V14] a revoked sub is INVALID/REVOKED with community entitlements', () => {
    expect(
      run({ revocations: { status: 'ok', revoked: new Set(['lic_test0001']) } }),
    ).toMatchObject({
      state: 'INVALID',
      reason: 'REVOKED',
      entitlementSource: 'community',
      org: 'Acme Forsakring AB',
    })
  })

  it('nbf beyond the 5-minute skew is INVALID/NOT_YET_VALID; within it VALID', () => {
    const at = (ms: number) => signLicense(payload({ iat: iso(T0 + ms), nbf: iso(T0 + ms) }))
    expect(run({ token: at(5 * 60_000 + 1_000) })).toMatchObject({
      state: 'INVALID',
      reason: 'NOT_YET_VALID',
    })
    expect(run({ token: at(4 * 60_000) }).state).toBe('VALID')
  })

  it('tampered → INVALID/BAD_SIGNATURE; not a token → INVALID', () => {
    expect(run({ token: tamper(signLicense()) })).toMatchObject({
      state: 'INVALID',
      reason: 'BAD_SIGNATURE',
    })
    expect(run({ token: 'not-a-license' }).state).toBe('INVALID')
  })

  it('[L7:V05] a ring without the dev kids (a production image) answers UNKNOWN_KID', () => {
    expect(run({ keyMap: {} })).toMatchObject({
      state: 'INVALID',
      reason: 'UNKNOWN_KID',
      entitlementSource: 'community',
    })
  })

  // Any env but "dev", not just "prod": env is a lenient slug (D-H), so a rule
  // weakened to `env === 'prod'` would accept a dev-signed "staging" (review m26).
  // The dev1 private key is public, so this is what keeps a dev token out of production.
  const NOT_DEV = ['prod', 'staging', 'production', 'test']
  it.each(NOT_DEV)('[L7:V05] dev-signed env:"%s": INVALID/DEV_KEY_ENV_MISMATCH', (env) => {
    expect(run({ token: signLicense(payload({ env })) })).toMatchObject({
      state: 'INVALID',
      reason: 'DEV_KEY_ENV_MISMATCH',
      kid: DEV_KID,
      env,
      entitlementSource: 'community',
    })
  })

  it('extra well-formed limit keys verify but are ignored: limits is exactly connections and tenants (D-D)', () => {
    const s = run({
      token: signLicense(
        payload({ limits: { connections: 5, tenants: 1, seats: 9, api_calls: 0 } }),
      ),
    })
    expect(s.state).toBe('VALID')
    expect(s.limits).toEqual({ connections: 5, tenants: 1 })
  })

  it.each([
    ['past the Date range', 9e15 - DAY],
    ['NaN', Number.NaN],
  ])(
    'an effective time %s is INVALID/EVALUATION_FAILED in community mode, not MALFORMED (review m34)',
    (_label, effectiveNowMs) => {
      expect(run({ effectiveNowMs })).toMatchObject({
        state: 'INVALID',
        reason: 'EVALUATION_FAILED',
        entitlementSource: 'community',
        limits: COMMUNITY_ENTITLEMENTS.limits,
      })
    },
  )

  it('daysRemaining is counted at the effective (rollback-protected) time, not the wall clock', () => {
    const s = run({ effectiveNowMs: T0 + 100 * DAY, evaluatedAtMs: T0 })
    expect(s.daysRemaining).toBe(265)
    expect(s.evaluatedAt).toBe(new Date(T0).toISOString())
  })

  it('a production kid may sign an env:"dev" license (accepted; the manager warns)', () => {
    const k = productionTestKey()
    expect(run({ token: signLicense(payload({ env: 'dev' }), k), keyMap: k.keyMap })).toMatchObject(
      { state: 'VALID', kid: 'k2026a', env: 'dev' },
    )
  })

  it('a placeholder key is INVALID/BAD_KEY, never a throw', () => {
    const k = productionTestKey()
    expect(
      run({
        token: signLicense(payload({ env: 'prod' }), k),
        keyMap: { k2026a: 'PLACEHOLDER:k2026a' },
      }),
    ).toMatchObject({ state: 'INVALID', reason: 'BAD_KEY' })
  })

  it('no source is MISSING; a file error is INVALID with its reason; env shadowing is reported', () => {
    expect(run({ source: { kind: 'none', path: '/x/license.key' } })).toMatchObject({
      state: 'MISSING',
      source: 'none',
      filePath: '/x/license.key',
      limits: { connections: 1, tenants: 1 },
    })
    expect(run({ source: { kind: 'error', path: '/x', reason: 'FILE_TOO_LARGE' } })).toMatchObject({
      state: 'INVALID',
      reason: 'FILE_TOO_LARGE',
      source: 'file',
      filePath: '/x',
    })
    const s = run({
      source: { kind: 'env', token: signLicense(), shadowedFile: '/data/license.key' },
    })
    expect(s).toMatchObject({ state: 'VALID', source: 'env', shadowedFile: '/data/license.key' })
    expect(s).not.toHaveProperty('filePath')
  })
})
