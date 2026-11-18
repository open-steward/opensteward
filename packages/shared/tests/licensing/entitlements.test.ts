import { describe, expect, it } from 'vitest'
import { VERTICALS } from '@opensteward/license-token'
import { EntitlementService } from '../../src/licensing/entitlements'
import { COMMUNITY_ENTITLEMENTS } from '../../src/licensing/community'
import { communityStatus } from '../../src/licensing/evaluate'
import type { LicenseStatus } from '../../src/licensing/types'

const BASE = {
  source: 'none',
  clockRollbackDetected: false,
  revocationList: 'missing',
  evaluatedAt: '2026-10-09T12:00:00.000Z',
} as const
const licensed = (features: string[]): LicenseStatus => ({
  ...BASE,
  source: 'env',
  state: 'VALID',
  features,
  limits: { connections: 5, tenants: 2 },
  entitlementSource: 'license',
})

describe('EntitlementService (the one gating API; never on tier)', () => {
  it('has() grants exactly the status features', () => {
    const e = new EntitlementService(licensed(['mcp', 'vertical:crm']))
    expect([
      e.has('mcp'),
      e.has('vertical:crm'),
      e.has('vertical:accounting'),
      e.has('sso'),
    ]).toEqual([true, true, false, false])
  })
  it('limit() reads the status limits', () => {
    const e = new EntitlementService(licensed([]))
    expect([e.limit('connections'), e.limit('tenants')]).toEqual([5, 2])
  })
  it('verticals() lists the entitled verticals in VERTICALS order', () => {
    expect(
      new EntitlementService(
        licensed(['vertical:payments', 'mcp', 'vertical:accounting']),
      ).verticals(),
    ).toEqual(['accounting', 'payments'])
  })
  it('community grants mcp and every current vertical, never sso or audit_export (D7)', () => {
    const e = new EntitlementService(communityStatus(BASE, 'MISSING'))
    expect(e.has('mcp')).toBe(true)
    expect(e.verticals()).toEqual([...VERTICALS])
    expect([e.has('sso'), e.has('audit_export')]).toEqual([false, false])
    expect([e.limit('connections'), e.limit('tenants')]).toEqual([1, 1])
    expect(COMMUNITY_ENTITLEMENTS.features).toEqual([
      'mcp',
      ...VERTICALS.map((v) => `vertical:${v}`),
    ])
  })
  it('status() is the status it was built from', () => {
    const s = licensed(['mcp'])
    expect(new EntitlementService(s).status()).toBe(s)
  })
})
