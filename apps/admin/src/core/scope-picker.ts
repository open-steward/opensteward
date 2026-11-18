/**
 * The tenant + vertical picker shared by the destination and SQL-principal
 * forms (`views/_scope-picker.ejs`).
 *
 * It only offers what the signed-in user may grant: an unrestricted user may
 * pick "every tenant" or any tenant; a tenant-restricted one only the tenants
 * in their own scope, and never "every tenant". admin-api (and
 * integration-server behind it) re-check the result — a scope that reaches
 * past the user's own answers 403 `SCOPE_EXCEEDS_CALLER`, which the forms
 * show — so this is a convenience, not the guard.
 */
import type { SessionUser } from './auth/middleware'
import type { AdminApiClient } from './proxy/admin-api-client'
import { KNOWN_VERTICALS, VERTICAL_LABELS } from './verticals'

export interface TenantOption {
  id: string
  name: string
}

export interface ScopePickerModel {
  /** The user may grant "every tenant". */
  allowAll: boolean
  /** The user's own scope is restricted (the form explains the limit). */
  restricted: boolean
  tenantOptions: TenantOption[]
  verticalOptions: Array<{ id: string; label: string }>
}

export interface ScopeSelection {
  tenants: '*' | string[]
  /** Empty means every vertical. */
  verticals: string[]
}

type Form = Record<string, string | string[] | undefined>

function list(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v
  return v === undefined || v === '' ? [] : [v]
}

export function isRestricted(user: SessionUser | undefined): boolean {
  return user?.scope?.mode === 'restricted'
}

export async function scopePickerModel(
  apiClient: AdminApiClient,
  user: SessionUser,
): Promise<ScopePickerModel> {
  // admin-api already filters the tenant list to a restricted user's scope.
  const tenants = await apiClient.listTenants(user.token).catch(() => [])
  const names = new Map(tenants.map((t) => [t.id, t.name]))
  const restricted = isRestricted(user)
  const tenantOptions: TenantOption[] = restricted
    ? (user.scope?.grants ?? []).map((g) => ({
        id: g.tenantId,
        name: names.get(g.tenantId) ?? g.tenantId,
      }))
    : tenants.map((t) => ({ id: t.id, name: t.name }))
  return {
    allowAll: !restricted,
    restricted,
    tenantOptions,
    verticalOptions: KNOWN_VERTICALS.map((v) => ({ id: v, label: VERTICAL_LABELS[v] })),
  }
}

/**
 * Read the picker out of a form post. `tenant_mode=all` (only honoured when
 * the user may grant it) or the checked `tenants`; the checked `verticals`,
 * none meaning all.
 */
export function scopeFromForm(
  body: Form,
  model: Pick<ScopePickerModel, 'allowAll'>,
): { selection: ScopeSelection; error: string | null } {
  const verticals = list(body['verticals']).filter((v) =>
    (KNOWN_VERTICALS as readonly string[]).includes(v),
  )
  const mode = list(body['tenant_mode']).pop()
  if (mode === 'all' && model.allowAll) {
    return { selection: { tenants: '*', verticals }, error: null }
  }
  const tenants = [
    ...new Set(
      list(body['tenants'])
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ]
  if (tenants.length === 0) {
    return {
      selection: { tenants: [], verticals },
      error: model.allowAll
        ? 'Pick at least one tenant, or every tenant.'
        : 'Pick at least one of your tenants.',
    }
  }
  return { selection: { tenants, verticals }, error: null }
}

/** A short human summary of a tenants/verticals scope for tables. */
export function describeScope(
  tenants: '*' | string[],
  verticals: '*' | string[] | Record<string, unknown> | undefined | null,
): string {
  const t =
    tenants === '*' ? 'All tenants' : tenants.length === 0 ? 'No tenants' : tenants.join(', ')
  let v = 'all verticals'
  if (Array.isArray(verticals)) v = verticals.join(', ')
  else if (verticals && typeof verticals === 'object') v = Object.keys(verticals).join(', ')
  return `${t} · ${v}`
}
