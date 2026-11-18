/**
 * The guest-token RLS clause: unrestricted → none, restricted → tenant (and
 * per-tenant vertical) predicates, empty → deny. Every literal is validated
 * and quoted; anything that cannot be expressed safely is dropped, which only
 * narrows the result — never widens it.
 */
import { describe, it, expect } from 'vitest'
import type { AccessScope, TenantGrants } from '../../src/core/auth/access'
import {
  buildRlsDecision,
  scopeCoversVerticals,
  sqlLiteral,
} from '../../src/core/analytics/superset-rls'

function restricted(entries: Array<[string, '*' | string[]]>): AccessScope {
  const tenants: TenantGrants = new Map()
  for (const [t, v] of entries) tenants.set(t, v === '*' ? '*' : new Set(v))
  return { mode: 'restricted', tenants }
}

describe('buildRlsDecision', () => {
  it('adds no clause for an unrestricted caller (or no resolved scope)', () => {
    expect(buildRlsDecision({ mode: 'all' })).toEqual({ kind: 'unrestricted' })
    expect(buildRlsDecision(null)).toEqual({ kind: 'unrestricted' })
  })

  it('denies an empty restricted scope', () => {
    const d = buildRlsDecision(restricted([]))
    expect(d.kind).toBe('deny')
  })

  it('limits whole tenants with one IN list, sorted', () => {
    expect(
      buildRlsDecision(
        restricted([
          ['beta', '*'],
          ['acme', '*'],
        ]),
      ),
    ).toEqual({
      kind: 'clause',
      clause: "owner_tenant_id IN ('acme', 'beta')",
    })
  })

  it('limits vertical-restricted tenants per tenant, OR-ed with whole tenants', () => {
    const d = buildRlsDecision(
      restricted([
        ['acme', '*'],
        ['beta', ['payments', 'crm']],
      ]),
    )
    expect(d).toEqual({
      kind: 'clause',
      clause:
        "(owner_tenant_id IN ('acme') OR (owner_tenant_id = 'beta' AND vertical IN ('crm', 'payments')))",
    })
  })

  it('handles only vertical-restricted tenants', () => {
    expect(buildRlsDecision(restricted([['t1', ['crm']]]))).toEqual({
      kind: 'clause',
      clause: "(owner_tenant_id = 't1' AND vertical IN ('crm'))",
    })
  })

  it('accepts the documented tenant id alphabet', () => {
    const d = buildRlsDecision(restricted([['Org_1.eu:prod-2', '*']]))
    expect(d).toEqual({ kind: 'clause', clause: "owner_tenant_id IN ('Org_1.eu:prod-2')" })
  })

  describe('injection attempts', () => {
    const attacks = [
      "x') OR 1=1 --",
      "a' OR 'a'='a",
      "t1'; DROP TABLE resources; --",
      't1" OR "1"="1',
      't1) OR (1=1',
      't1 OR 1=1',
      't1/**/OR/**/1=1',
      't1\u0000',
      't1\nOR 1=1',
      '',
      "\\' OR 1=1 --",
    ]

    for (const tenant of attacks) {
      it(`drops tenant ${JSON.stringify(tenant)} and never emits it`, () => {
        const alone = buildRlsDecision(restricted([[tenant, '*']]))
        expect(alone.kind).toBe('deny')
        const mixed = buildRlsDecision(
          restricted([
            [tenant, '*'],
            ['safe', '*'],
          ]),
        )
        expect(mixed).toEqual({ kind: 'clause', clause: "owner_tenant_id IN ('safe')" })
      })
    }

    it('drops malicious verticals, and the tenant with them when none survive', () => {
      const d = buildRlsDecision(
        restricted([
          ['acme', ["crm') OR 1=1 --", 'payments']],
          ['beta', ["x' OR 'y'='y"]],
        ]),
      )
      expect(d).toEqual({
        kind: 'clause',
        clause: "(owner_tenant_id = 'acme' AND vertical IN ('payments'))",
      })
    })

    it('never produces an unbalanced quote', () => {
      const d = buildRlsDecision(
        restricted([
          ["o'brien", '*'],
          ['ok', ['crm', "c'rm"]],
        ]),
      )
      expect(d.kind).toBe('clause')
      const clause = (d as { clause: string }).clause
      expect((clause.match(/'/g) ?? []).length % 2).toBe(0)
      expect(clause).not.toContain('brien')
      expect(clause).not.toContain("c'rm")
    })
  })

  it('sqlLiteral doubles single quotes', () => {
    expect(sqlLiteral("a'b")).toBe("'a''b'")
  })
})

describe('scopeCoversVerticals', () => {
  it('lets an unrestricted caller open anything', () => {
    expect(scopeCoversVerticals({ mode: 'all' }, ['crm'])).toBe(true)
  })
  it('refuses an empty scope even for a cross-vertical dashboard', () => {
    expect(scopeCoversVerticals(restricted([]), null)).toBe(false)
  })
  it('requires one of the dashboard verticals in some tenant grant', () => {
    const s = restricted([['acme', ['crm']]])
    expect(scopeCoversVerticals(s, null)).toBe(true)
    expect(scopeCoversVerticals(s, ['crm', 'payments'])).toBe(true)
    expect(scopeCoversVerticals(s, ['payments'])).toBe(false)
    expect(scopeCoversVerticals(restricted([['acme', '*']]), ['payments'])).toBe(true)
  })
})
