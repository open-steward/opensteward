import { describe, expect, it } from 'vitest'
import {
  ENV_PATTERN,
  FEATURE_PATTERN,
  FORMAT_VERSION,
  KID_PATTERN,
  KNOWN_ENVS,
  KNOWN_FEATURES,
  KNOWN_TIERS,
  LICENSE_ASSERTION,
  LICENSE_AUDIENCE,
  LICENSE_ISSUER,
  LIMIT_KEY_PATTERN,
  LIMIT_KEYS,
  MAX_FEATURE_LENGTH,
  MAX_FEATURES,
  MAX_FOOTER_BYTES,
  MAX_LIMIT_KEYS,
  MAX_REVOKED,
  MAX_SIGNING_INPUT_BYTES,
  MAX_TOKEN_LENGTH,
  NBF_SKEW_MS,
  PASETO_HEADER,
  REVOCATIONS_ASSERTION,
  SUB_PATTERN,
  TIER_PATTERN,
  UNLIMITED_FROM,
  VERTICALS,
  isKnownEnv,
  isKnownFeature,
  isKnownTier,
  isUnlimitedLimit,
  verticalFeature,
} from '../src'
import { assertionFor } from '../src/constants'

describe('contract vocabulary', () => {
  // Drift against apps/integration-server/src/verticals is pinned in
  // scripts/license-token-wiring.test.ts (outside this package's turbo inputs).
  it('VERTICALS is the nine-vertical catalogue', () =>
    expect(VERTICALS).toEqual([
      'accounting',
      'crm',
      'ecommerce',
      'logistics',
      'payments',
      'docsign',
      'projects',
      'customer-support',
      'inventory',
    ]))
  it('KNOWN_FEATURES = mcp, vertical:<each>, sso, audit_export', () => {
    expect(KNOWN_FEATURES).toEqual([
      'mcp',
      ...VERTICALS.map((v) => `vertical:${v}`),
      'sso',
      'audit_export',
    ])
    for (const f of KNOWN_FEATURES) expect(f).toMatch(FEATURE_PATTERN)
    expect(verticalFeature('crm')).toBe('vertical:crm')
    expect(Object.isFrozen(KNOWN_FEATURES)).toBe(true)
  })
  it.each(['mcp', 'sso', 'audit_export', 'vertical:customer-support', 'vertical:hr', 'a1:b2-c'])(
    'FEATURE_PATTERN accepts %s',
    (f) => expect(FEATURE_PATTERN.test(f)).toBe(true),
  )
  it.each([
    '',
    'MCP',
    '1mcp',
    'mcp ',
    'vertical:',
    ':crm',
    'vertical:Crm',
    'vertical:-crm',
    'vertical:crm:x',
    'vertical:crm_x',
    'vertical/crm',
  ])('FEATURE_PATTERN rejects %j', (f) => expect(FEATURE_PATTERN.test(f)).toBe(false))
  it('isKnownFeature separates the catalogue from well-formed future features', () => {
    expect(isKnownFeature('vertical:crm')).toBe(true)
    expect(isKnownFeature('vertical:hr')).toBe(false)
  })
  it('tier and env are lenient slugs; KNOWN_* list what the service issues today (D-H)', () => {
    expect(KNOWN_TIERS).toEqual(['free', 'pro', 'enterprise'])
    expect(KNOWN_ENVS).toEqual(['prod', 'dev'])
    for (const s of [...KNOWN_TIERS, 'team', 'business_plus', 'pro-2027', 'a', 'a'.repeat(32)]) {
      expect(TIER_PATTERN.test(s), s).toBe(true)
    }
    for (const s of [...KNOWN_ENVS, 'staging', 'qa-eu1']) expect(ENV_PATTERN.test(s), s).toBe(true)
    for (const s of ['', 'Free', '1free', '-pro', 'pro tier', 'a'.repeat(33), 'prod\n']) {
      expect(TIER_PATTERN.test(s), s).toBe(false)
      expect(ENV_PATTERN.test(s), s).toBe(false)
    }
    expect([isKnownTier('pro'), isKnownTier('team')]).toEqual([true, false])
    expect([isKnownEnv('dev'), isKnownEnv('staging')]).toEqual([true, false])
  })
  it('pins every other contract constant', () => {
    expect(LIMIT_KEYS).toEqual(['connections', 'tenants'])
    expect([LICENSE_ISSUER, LICENSE_AUDIENCE, FORMAT_VERSION]).toEqual([
      'opensteward.dev',
      'opensteward',
      1,
    ])
    expect([PASETO_HEADER, LICENSE_ASSERTION, REVOCATIONS_ASSERTION]).toEqual([
      'v4.public.',
      'opensteward-license-v1',
      'opensteward-revocations-v1',
    ])
    expect([MAX_SIGNING_INPUT_BYTES, MAX_TOKEN_LENGTH, MAX_FOOTER_BYTES, NBF_SKEW_MS]).toEqual([
      4096, 6144, 256, 300_000,
    ])
    expect([MAX_FEATURES, MAX_FEATURE_LENGTH, MAX_LIMIT_KEYS, MAX_REVOKED]).toEqual([
      128, 64, 16, 256,
    ])
    expect(assertionFor('license')).toBe(LICENSE_ASSERTION)
    expect(assertionFor('revocations')).toBe(REVOCATIONS_ASSERTION)
  })
  it('LIMIT_KEY_PATTERN, SUB_PATTERN and KID_PATTERN', () => {
    for (const k of ['connections', 'tenants', 'seats', 'api_calls_per_day']) {
      expect(LIMIT_KEY_PATTERN.test(k), k).toBe(true)
    }
    for (const k of ['', 'Seats', '1seats', 'api-calls', 'a'.repeat(33)]) {
      expect(LIMIT_KEY_PATTERN.test(k), k).toBe(false)
    }
    expect(SUB_PATTERN.test('lic_8f3k2abc')).toBe(true)
    for (const s of [
      'lic_short',
      'LIC_abcdef',
      'lic_abc-def',
      'license_abcdef',
      `lic_${'a'.repeat(65)}`,
    ]) {
      expect(SUB_PATTERN.test(s), s).toBe(false)
    }
    for (const k of ['k2026a', 'k2026b', 'k2026c', 'r2026a', 'r2026b', 'dev1', 'devk1']) {
      expect(KID_PATTERN.test(k), k).toBe(true)
    }
    for (const k of ['', 'K2026A', 'k2026a!', 'a'.repeat(17), '__proto__']) {
      expect(KID_PATTERN.test(k), k).toBe(false)
    }
  })
  it('limits from UNLIMITED_FROM up display as Unlimited; below it they are numbers', () => {
    expect(UNLIMITED_FROM).toBe(1_000_000)
    expect([0, 5, 999_999].map(isUnlimitedLimit)).toEqual([false, false, false])
    expect([1_000_000, 1_000_001, Number.MAX_SAFE_INTEGER].map(isUnlimitedLimit)).toEqual([
      true,
      true,
      true,
    ])
  })
})
