/**
 * Dashboard audiences: who may see a dashboard's DEFINITION, and which
 * tenants its DATA may come from. Every visibility decision in admin-api —
 * the native list, get, edit and metric reads, the Superset registry and
 * guest tokens — goes through this module, so there is one rule.
 *
 *   - audience: `private` (owner only), `tenants` (anyone whose scope holds
 *     ANY listed tenant) or `everyone` (every dashboards:view holder). The
 *     owner always sees their own; an admin with an unrestricted scope sees
 *     every dashboard.
 *   - pinnedTenants: optional. Data is the viewer's scope ∩ the pins. Pins
 *     only ever NARROW; the viewer's own scope stays the security boundary.
 *     A pinned dashboard is also hidden from a restricted viewer holding
 *     none of its pins: it would render empty for them, and it is about
 *     tenants they cannot see.
 */
import { allowedTenantIds, type Access, type AccessScope } from '../auth/access'
import type { DataScopeHeader } from '../proxy/client'

export type Audience =
  { kind: 'private' } | { kind: 'tenants'; tenants: string[] } | { kind: 'everyone' }

export interface AudienceSubject {
  /** Null for a built-in or a Superset dashboard. */
  ownerUserId: string | null
  audience: Audience
  pinnedTenants: string[] | null
}

export interface Viewer {
  userId: string
  /** Null in a bare harness with no resolver: reads as unrestricted. */
  access: Access | null
  /** baseRole === 'admin'. */
  admin: boolean
}

export type AudienceCheck = { ok: true } | { ok: false; status: 400 | 403; error: string }

export function normaliseTenants(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort()
}

export function normalisePins(ids: readonly string[] | null | undefined): string[] | null {
  if (!ids || ids.length === 0) return null
  return normaliseTenants(ids)
}

/** A stored JSON tenant list. Unreadable → `[]` (matches nobody): fail closed. */
export function parseTenantList(json: string | null): string[] | null {
  if (json === null) return null
  try {
    const parsed = JSON.parse(json) as unknown
    return Array.isArray(parsed)
      ? normaliseTenants(parsed.filter((t): t is string => typeof t === 'string'))
      : []
  } catch {
    return []
  }
}

export function sameAudience(a: Audience, b: Audience): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind !== 'tenants' || b.kind !== 'tenants') return true
  return normaliseTenants(a.tenants).join('\n') === normaliseTenants(b.tenants).join('\n')
}

export function samePins(a: string[] | null, b: string[] | null): boolean {
  return (normalisePins(a) ?? []).join('\n') === (normalisePins(b) ?? []).join('\n')
}

function scopeHas(scope: AccessScope | null | undefined, tenant: string): boolean {
  return !scope || scope.mode === 'all' || scope.tenants.has(tenant)
}

export function seesEveryDashboard(v: Viewer): boolean {
  return v.admin && (!v.access || v.access.scope.mode === 'all')
}

export function canSeeDashboard(v: Viewer, d: AudienceSubject): boolean {
  if (d.ownerUserId !== null && d.ownerUserId === v.userId) return true
  if (seesEveryDashboard(v)) return true
  const scope = v.access?.scope
  const audienceOk =
    d.audience.kind === 'everyone' ||
    (d.audience.kind === 'tenants' && d.audience.tenants.some((t) => scopeHas(scope, t)))
  const pinsOk = !d.pinnedTenants?.length || d.pinnedTenants.some((t) => scopeHas(scope, t))
  return audienceOk && pinsOk
}

export function canEditDashboard(v: Viewer, d: AudienceSubject): boolean {
  return d.ownerUserId !== null && (d.ownerUserId === v.userId || v.admin)
}

/** Audience and pins as this viewer may see them: foreign tenant ids removed unless `fullView`. */
export function redactFor(
  v: Viewer,
  d: AudienceSubject,
  fullView: boolean,
): { audience: Audience; pinnedTenants: string[] | null } {
  const scope = v.access?.scope
  if (fullView || !scope || scope.mode === 'all') {
    return { audience: d.audience, pinnedTenants: d.pinnedTenants }
  }
  const mine = (ids: string[]) => ids.filter((t) => scope.tenants.has(t))
  return {
    audience:
      d.audience.kind === 'tenants'
        ? { kind: 'tenants', tenants: mine(d.audience.tenants) }
        : d.audience,
    pinnedTenants: d.pinnedTenants ? mine(d.pinnedTenants) : null,
  }
}

/** The data-scope header for a pinned dashboard: viewer scope ∩ pins. */
export function narrowDataScope(scope: DataScopeHeader, pins: string[] | null): DataScopeHeader {
  if (!pins || pins.length === 0) return scope
  const want = normaliseTenants(pins)
  if (scope.tenants === '*') return { ...scope, tenants: want }
  const tenants = scope.tenants.filter((t) => want.includes(t))
  const tenantVerticals = Object.fromEntries(
    Object.entries(scope.tenantVerticals ?? {}).filter(([t]) => tenants.includes(t)),
  )
  return { ...scope, tenants, tenantVerticals }
}

/** The access scope a Superset guest token is built from: viewer scope ∩ pins. */
export function narrowAccessScope(
  scope: AccessScope | null | undefined,
  pins: string[] | null,
): AccessScope | null | undefined {
  if (!pins || pins.length === 0) return scope
  const want = new Set(pins)
  if (!scope || scope.mode === 'all') {
    return { mode: 'restricted', tenants: new Map([...want].map((t) => [t, '*' as const])) }
  }
  return {
    mode: 'restricted',
    tenants: new Map([...scope.tenants].filter(([t]) => want.has(t))),
  }
}

/**
 * `dashboards:share_all` only counts for a caller with an unrestricted scope:
 * `everyone` and Superset registry entries are deployment-wide, so a
 * tenant-restricted holder (a custom role) must not use them.
 */
export function effectiveShareAll(
  permissions: ReadonlySet<string>,
  access: Access | null,
): boolean {
  return permissions.has('dashboards:share_all') && (!access || access.scope.mode === 'all')
}

/**
 * May this caller make this sharing change? Only what the request ADDS is
 * checked against the caller (permission, own scope, known tenant): a tenant
 * already in the stored audience or pins is carried over unchecked, so an
 * owner can edit a dashboard holding tenants they could not set themselves.
 * The resulting combination is checked for consistency. Order matters: the scope
 * check runs before the existence check, so a restricted caller cannot probe
 * which tenant ids exist.
 */
export function checkAudienceChange(input: {
  changed: { audience?: Audience; pinnedTenants?: string[] | null }
  result: { audience: Audience; pinnedTenants: string[] | null }
  /** What is stored now; a create passes private with no pins. */
  stored: { audience: Audience; pinnedTenants: string[] | null }
  access: Access | null
  canShareAll: boolean
  knownTenants: ReadonlySet<string>
}): AudienceCheck {
  const { changed, result } = input
  if (changed.audience?.kind === 'everyone' && !input.canShareAll) {
    return {
      ok: false,
      status: 403,
      error: 'Sharing with everyone requires the dashboards:share_all permission.',
    }
  }
  const storedAudience = new Set(
    input.stored.audience.kind === 'tenants' ? input.stored.audience.tenants : [],
  )
  const storedPins = new Set(input.stored.pinnedTenants ?? [])
  const named = normaliseTenants([
    ...(changed.audience?.kind === 'tenants'
      ? changed.audience.tenants.filter((t) => !storedAudience.has(t))
      : []),
    ...(changed.pinnedTenants ?? []).filter((t) => !storedPins.has(t)),
  ])
  const allowed = allowedTenantIds(input.access)
  if (allowed) {
    const outside = named.filter((t) => !allowed.includes(t))
    if (outside.length > 0) {
      return {
        ok: false,
        status: 403,
        error: `You can only share with or pin tenants in your own access: ${outside.join(', ')}`,
      }
    }
  }
  const unknown = named.filter((t) => !input.knownTenants.has(t))
  if (unknown.length > 0) {
    return { ok: false, status: 400, error: `Unknown tenant: ${unknown.join(', ')}` }
  }
  const audience = result.audience
  if (audience.kind === 'tenants' && result.pinnedTenants) {
    const stray = result.pinnedTenants.filter((t) => !audience.tenants.includes(t))
    if (stray.length > 0) {
      return {
        ok: false,
        status: 400,
        error: `Pinned tenants must be among the tenants it is shared with: ${stray.join(', ')}`,
      }
    }
  }
  return { ok: true }
}
