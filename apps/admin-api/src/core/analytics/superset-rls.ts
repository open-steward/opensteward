/**
 * Row-level security for embedded Superset dashboards.
 *
 * A guest token carries RLS clauses that Superset ANDs into every query the
 * embedded dashboard runs. The clause is built here from the signed-in
 * operator's tenant scope (`core/auth/access.ts`), so an embedded chart shows
 * exactly the tenants the operator may see in the rest of the console:
 *
 *   - unrestricted scope → no clause (every row, including connections with
 *     no owner tenant, which the analytics views expose to all-tenant logins);
 *   - restricted scope   → `owner_tenant_id IN ('a','b')`, and for a tenant
 *     granted only some verticals `(owner_tenant_id = 'c' AND vertical IN
 *     ('crm','payments'))`, OR-ed together. Rows with a NULL owner never
 *     match, as in the rest of the console;
 *   - an empty restricted scope → `deny`: no token is minted at all (403).
 *
 * The clause is SQL text that Superset pastes into a WHERE clause, so every
 * literal is validated against a strict pattern and quoted with doubled
 * single quotes. A tenant id or vertical that fails validation cannot be
 * expressed safely; it is dropped, which only ever NARROWS what the token can
 * see (fail closed). If nothing survives, the result is `deny`.
 *
 * Every dataset the bootstrap job registers is an `os_analytics` view with
 * `owner_tenant_id` and `vertical` columns, so one clause without a dataset id
 * applies to all of them.
 */
import type { AccessScope } from '../auth/access'

/** Tenant ids that may appear in a clause. */
export const RLS_TENANT_ID_RE = /^[A-Za-z0-9._:-]+$/
/** Vertical slugs that may appear in a clause. */
export const RLS_VERTICAL_RE = /^[a-z][a-z0-9_-]*$/

export type RlsDecision =
  { kind: 'unrestricted' } | { kind: 'clause'; clause: string } | { kind: 'deny'; reason: string }

/** A SQL string literal. Callers validate first; doubling quotes is defence in depth. */
export function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function inList(values: readonly string[]): string {
  return values.map(sqlLiteral).join(', ')
}

/** Build the guest-token RLS decision for a caller's scope. */
export function buildRlsDecision(scope: AccessScope | null | undefined): RlsDecision {
  // No resolved scope (bare harness) reads as unrestricted, like every other
  // helper in access.ts.
  if (!scope || scope.mode === 'all') return { kind: 'unrestricted' }

  const wholeTenants: string[] = []
  const partial: Array<{ tenant: string; verticals: string[] }> = []
  for (const [tenant, grant] of [...scope.tenants.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    if (!RLS_TENANT_ID_RE.test(tenant)) continue
    if (grant === '*') {
      wholeTenants.push(tenant)
      continue
    }
    const verticals = [...grant].filter((v) => RLS_VERTICAL_RE.test(v)).sort()
    if (verticals.length > 0) partial.push({ tenant, verticals })
  }

  if (wholeTenants.length === 0 && partial.length === 0) {
    return {
      kind: 'deny',
      reason:
        scope.tenants.size === 0
          ? 'Your access is restricted to no tenants.'
          : 'None of your tenant grants can be applied to an embedded dashboard.',
    }
  }

  const parts: string[] = []
  if (wholeTenants.length > 0) parts.push(`owner_tenant_id IN (${inList(wholeTenants)})`)
  for (const p of partial) {
    parts.push(
      `(owner_tenant_id = ${sqlLiteral(p.tenant)} AND vertical IN (${inList(p.verticals)}))`,
    )
  }
  const clause = parts.length === 1 ? parts[0]! : `(${parts.join(' OR ')})`
  return { kind: 'clause', clause }
}

/**
 * May a caller with this scope open a dashboard about these verticals?
 * `null`/empty verticals = not tied to a vertical: anyone with a non-empty
 * scope. Otherwise the scope must reach at least one of them.
 */
export function scopeCoversVerticals(
  scope: AccessScope | null | undefined,
  verticals: readonly string[] | null,
): boolean {
  if (!scope || scope.mode === 'all') return true
  if (scope.tenants.size === 0) return false
  if (!verticals || verticals.length === 0) return true
  for (const grant of scope.tenants.values()) {
    if (grant === '*') return true
    if (verticals.some((v) => grant.has(v))) return true
  }
  return false
}
