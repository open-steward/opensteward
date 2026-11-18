import { describe, expect, it } from 'vitest'
import type { Access, AccessScope } from '../../src/core/auth/access'
import {
  canEditDashboard,
  canSeeDashboard,
  checkAudienceChange,
  narrowAccessScope,
  narrowDataScope,
  normalisePins,
  parseTenantList,
  redactFor,
  sameAudience,
  type Audience,
  type AudienceSubject,
  type Viewer,
} from '../../src/core/dashboards/audience'
import { buildRlsDecision } from '../../src/core/analytics/superset-rls'

const ALL: AccessScope = { mode: 'all' }
function only(grants: Record<string, '*' | string[]>): AccessScope {
  return {
    mode: 'restricted',
    tenants: new Map(Object.entries(grants).map(([t, v]) => [t, v === '*' ? '*' : new Set(v)])),
  }
}
function viewer(scope: AccessScope | null, opts: { admin?: boolean; id?: string } = {}): Viewer {
  const access: Access | null = scope
    ? {
        userId: opts.id ?? 'u-viewer',
        baseRole: opts.admin ? 'admin' : 'operator',
        roleId: 'r',
        roleName: 'r',
        permissions: new Set(),
        scope,
      }
    : null
  return { userId: opts.id ?? 'u-viewer', access, admin: !!opts.admin }
}
function dash(audience: Audience, pinnedTenants: string[] | null = null): AudienceSubject {
  return { ownerUserId: 'u-owner', audience, pinnedTenants }
}
const ACME: Audience = { kind: 'tenants', tenants: ['acme'] }

describe('canSeeDashboard', () => {
  it('owner always sees their own, even private', () => {
    expect(canSeeDashboard(viewer(only({}), { id: 'u-owner' }), dash({ kind: 'private' }))).toBe(
      true,
    )
  })
  it('private is hidden from everyone else but an unrestricted admin', () => {
    expect(canSeeDashboard(viewer(ALL), dash({ kind: 'private' }))).toBe(false)
    expect(canSeeDashboard(viewer(ALL, { admin: true }), dash({ kind: 'private' }))).toBe(true)
    expect(
      canSeeDashboard(viewer(only({ acme: '*' }), { admin: true }), dash({ kind: 'private' })),
    ).toBe(false)
  })
  it('tenants: any listed tenant in scope matches', () => {
    const d = dash({ kind: 'tenants', tenants: ['acme', 'globex'] })
    expect(canSeeDashboard(viewer(only({ globex: ['crm'] })), d)).toBe(true)
    expect(canSeeDashboard(viewer(only({ initech: '*' })), d)).toBe(false)
    expect(canSeeDashboard(viewer(ALL), d)).toBe(true)
    expect(canSeeDashboard(viewer(null), d)).toBe(true)
  })
  it('everyone matches any dashboards:view holder, even an empty scope', () => {
    expect(canSeeDashboard(viewer(only({})), dash({ kind: 'everyone' }))).toBe(true)
  })
  it('a pinned dashboard is hidden from a restricted viewer holding none of its pins', () => {
    const d = dash({ kind: 'tenants', tenants: ['acme', 'globex'] }, ['acme'])
    expect(canSeeDashboard(viewer(only({ globex: '*' })), d)).toBe(false)
    expect(canSeeDashboard(viewer(only({ acme: '*' })), d)).toBe(true)
    expect(canSeeDashboard(viewer(only({ globex: '*' }), { admin: true }), d)).toBe(false)
    expect(canSeeDashboard(viewer(ALL), dash({ kind: 'everyone' }, ['acme']))).toBe(true)
  })
})

describe('canEditDashboard', () => {
  it('owner or admin; never a built-in', () => {
    expect(canEditDashboard(viewer(ALL, { id: 'u-owner' }), dash(ACME))).toBe(true)
    expect(canEditDashboard(viewer(only({ acme: '*' }), { admin: true }), dash(ACME))).toBe(true)
    expect(canEditDashboard(viewer(ALL), dash(ACME))).toBe(false)
    expect(
      canEditDashboard(viewer(ALL, { admin: true }), {
        ...dash({ kind: 'everyone' }),
        ownerUserId: null,
      }),
    ).toBe(false)
  })
})

describe('redactFor', () => {
  it('a non-editor sees only tenant ids inside their own scope', () => {
    const d = dash({ kind: 'tenants', tenants: ['acme', 'globex'] }, ['acme', 'globex'])
    expect(redactFor(viewer(only({ acme: '*' })), d, false)).toEqual({
      audience: { kind: 'tenants', tenants: ['acme'] },
      pinnedTenants: ['acme'],
    })
  })
  it('an editor (fullView) and an unrestricted viewer see everything', () => {
    const d = dash({ kind: 'tenants', tenants: ['acme', 'globex'] }, ['globex'])
    expect(redactFor(viewer(only({ acme: '*' })), d, true)).toEqual({
      audience: d.audience,
      pinnedTenants: ['globex'],
    })
    expect(redactFor(viewer(ALL), d, false).audience).toEqual(d.audience)
  })
})

describe('narrowDataScope', () => {
  it('no pins: unchanged', () => {
    expect(narrowDataScope({ tenants: '*', maskFinancial: true }, null)).toEqual({
      tenants: '*',
      maskFinancial: true,
    })
  })
  it('unrestricted + pins → exactly the pins (drops untenanted connections)', () => {
    expect(narrowDataScope({ tenants: '*' }, ['globex', 'acme'])).toEqual({
      tenants: ['acme', 'globex'],
    })
  })
  it('restricted + pins → intersection, verticals kept', () => {
    expect(
      narrowDataScope(
        { tenants: ['acme', 'globex'], tenantVerticals: { acme: '*', globex: ['crm'] } },
        ['globex', 'initech'],
      ),
    ).toEqual({ tenants: ['globex'], tenantVerticals: { globex: ['crm'] } })
  })
  it('no overlap → no tenants at all', () => {
    expect(
      narrowDataScope({ tenants: ['acme'], tenantVerticals: { acme: '*' } }, ['globex']),
    ).toEqual({
      tenants: [],
      tenantVerticals: {},
    })
  })
})

describe('narrowAccessScope → Superset RLS', () => {
  it('unrestricted admin opening a dashboard pinned to acme gets a clause, not none', () => {
    expect(buildRlsDecision(narrowAccessScope(ALL, ['acme']))).toEqual({
      kind: 'clause',
      clause: "owner_tenant_id IN ('acme')",
    })
    expect(buildRlsDecision(narrowAccessScope(null, ['acme'])).kind).toBe('clause')
  })
  it('restricted scope is intersected; no pins leaves it alone', () => {
    const s = only({ acme: '*', globex: ['crm'] })
    expect(buildRlsDecision(narrowAccessScope(s, ['globex']))).toEqual({
      kind: 'clause',
      clause: "(owner_tenant_id = 'globex' AND vertical IN ('crm'))",
    })
    expect(narrowAccessScope(s, null)).toBe(s)
  })
})

describe('checkAudienceChange', () => {
  const known = new Set(['acme', 'globex', 'initech'])
  const base = {
    canShareAll: false,
    knownTenants: known,
    stored: { audience: { kind: 'private' } as Audience, pinnedTenants: null as string[] | null },
  }
  const result = (audience: Audience, pinnedTenants: string[] | null = null) => ({
    audience,
    pinnedTenants,
  })

  it('everyone needs dashboards:share_all', () => {
    const r = checkAudienceChange({
      ...base,
      access: null,
      changed: { audience: { kind: 'everyone' } },
      result: result({ kind: 'everyone' }),
    })
    expect(r).toEqual({
      ok: false,
      status: 403,
      error: 'Sharing with everyone requires the dashboards:share_all permission.',
    })
    expect(
      checkAudienceChange({
        ...base,
        canShareAll: true,
        access: null,
        changed: { audience: { kind: 'everyone' } },
        result: result({ kind: 'everyone' }),
      }),
    ).toEqual({ ok: true })
  })
  it('an unchanged everyone audience is not re-checked', () => {
    expect(
      checkAudienceChange({
        ...base,
        access: null,
        changed: {},
        result: result({ kind: 'everyone' }),
      }),
    ).toEqual({ ok: true })
  })
  it('a restricted editor may only name tenants in their scope (403 before any existence check)', () => {
    const access = viewer(only({ acme: '*' })).access
    const r = checkAudienceChange({
      ...base,
      access,
      changed: { audience: { kind: 'tenants', tenants: ['acme', 'nope'] } },
      result: result({ kind: 'tenants', tenants: ['acme', 'nope'] }),
    })
    expect(r).toEqual({
      ok: false,
      status: 403,
      error: 'You can only share with or pin tenants in your own access: nope',
    })
    const pin = checkAudienceChange({
      ...base,
      access,
      changed: { pinnedTenants: ['globex'] },
      result: result({ kind: 'private' }, ['globex']),
    })
    expect(pin).toMatchObject({ ok: false, status: 403 })
  })
  it('unknown tenants are 400 for an unrestricted editor', () => {
    expect(
      checkAudienceChange({
        ...base,
        access: null,
        changed: { audience: { kind: 'tenants', tenants: ['nope'] } },
        result: result({ kind: 'tenants', tenants: ['nope'] }),
      }),
    ).toEqual({ ok: false, status: 400, error: 'Unknown tenant: nope' })
  })
  it('pins must be among the audience tenants', () => {
    expect(
      checkAudienceChange({
        ...base,
        access: null,
        changed: { pinnedTenants: ['globex'] },
        result: result(ACME, ['globex']),
      }),
    ).toEqual({
      ok: false,
      status: 400,
      error: 'Pinned tenants must be among the tenants it is shared with: globex',
    })
  })
  it('only tenants the change ADDS are checked; carried-over ones are not', () => {
    const access = viewer(only({ acme: '*' })).access
    const stored = {
      audience: { kind: 'tenants', tenants: ['globex', 'deleted'] } as Audience,
      pinnedTenants: null,
    }
    const next: Audience = { kind: 'tenants', tenants: ['acme', 'deleted', 'globex'] }
    expect(
      checkAudienceChange({
        ...base,
        stored,
        access,
        changed: { audience: next },
        result: result(next),
      }),
    ).toEqual({ ok: true })
    const foreign: Audience = { kind: 'tenants', tenants: ['deleted', 'globex', 'initech'] }
    expect(
      checkAudienceChange({
        ...base,
        stored,
        access,
        changed: { audience: foreign },
        result: result(foreign),
      }),
    ).toEqual({
      ok: false,
      status: 403,
      error: 'You can only share with or pin tenants in your own access: initech',
    })
  })
  it('clearing pins is always allowed', () => {
    const access = viewer(only({ acme: '*' })).access
    expect(
      checkAudienceChange({
        ...base,
        access,
        changed: { pinnedTenants: null },
        result: result(ACME),
      }),
    ).toEqual({ ok: true })
  })
})

describe('helpers', () => {
  it('parseTenantList fails closed', () => {
    expect(parseTenantList(null)).toBeNull()
    expect(parseTenantList('["globex","acme","acme"]')).toEqual(['acme', 'globex'])
    expect(parseTenantList('not json')).toEqual([])
    expect(parseTenantList('{"a":1}')).toEqual([])
  })
  it('normalisePins turns empty into null', () => {
    expect(normalisePins([])).toBeNull()
    expect(normalisePins(undefined)).toBeNull()
    expect(normalisePins(['b', 'a', 'b'])).toEqual(['a', 'b'])
  })
  it('sameAudience compares kinds and sorted tenants', () => {
    expect(
      sameAudience(
        { kind: 'tenants', tenants: ['b', 'a'] },
        { kind: 'tenants', tenants: ['a', 'b'] },
      ),
    ).toBe(true)
    expect(sameAudience({ kind: 'everyone' }, { kind: 'private' })).toBe(false)
  })
})
