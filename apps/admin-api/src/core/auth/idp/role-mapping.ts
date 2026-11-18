/**
 * Role- and scope-mapping engine — maps IdP groups/claims to OpenSteward
 * roles and tenant scope.
 *
 * Role rules are evaluated by ascending `priority` (first match wins). When no
 * rule matches, the provider's `default_role` applies. Scope rules are
 * different: every matching rule applies and the tenants are unioned; when
 * none matches, the provider's default scope applies. Both are re-run on
 * every login (and on SCIM group changes) so drift in the IdP propagates.
 *
 * `readClaimValues` moved to `@opensteward/shared` (`auth/claims.ts`) when the
 * developer-API OIDC verifier needed the same reader; it is re-exported here
 * so this module's callers and tests are unchanged. One implementation, so
 * the two features cannot drift on how a nested or array-valued claim reads.
 */
import { readClaimValues } from '@opensteward/shared'
import type {
  IdentityProviderRow,
  RoleMappingRuleRow,
  Role,
  RoleMatchType,
  ScopeMappingRuleRow,
} from '../../db/identity-store'
import type { ScopeGrant } from '../../db/admin-store'

export { readClaimValues }

/** Cap regex source length + match input to bound ReDoS exposure. */
const MAX_REGEX_LEN = 200
const MAX_INPUT_LEN = 4_000

/** Does any claim value satisfy the rule? Shared by role and scope rules. */
export function matches(rule: { matchType: RoleMatchType; matchValue: string }, values: string[]): boolean {
  const needle = rule.matchValue
  for (const raw of values) {
    const v = raw.length > MAX_INPUT_LEN ? raw.slice(0, MAX_INPUT_LEN) : raw
    switch (rule.matchType) {
      case 'equals':
        if (v === needle) return true
        break
      case 'contains':
        if (v.includes(needle)) return true
        break
      case 'regex': {
        if (needle.length > MAX_REGEX_LEN) break
        try {
          if (new RegExp(needle).test(v)) return true
        } catch {
          // invalid regex never matches
        }
        break
      }
    }
  }
  return false
}

/**
 * Resolve the role for an authenticated identity. Pure function — no I/O.
 *
 * @param rules    already sorted by ascending priority (IdentityStore.listRules)
 * @param attributes the identity's claim/attribute bag
 * @param defaultRole provider fallback role
 */
export function resolveRole(
  rules: RoleMappingRuleRow[],
  attributes: Record<string, unknown>,
  defaultRole: Role,
): Role {
  return resolveRoleAssignment(rules, attributes, defaultRole).role
}

/** What a role mapping resolves to: the base role, plus the custom role when
 *  the matching rule grants one (null = the built-in `role` itself). */
export interface RoleAssignment {
  role: Role
  roleId: string | null
}

/**
 * {@link resolveRole}, carrying the matched rule's custom role. Pure — no I/O.
 * The provider default is always a built-in, so it resolves with `roleId: null`.
 */
export function resolveRoleAssignment(
  rules: RoleMappingRuleRow[],
  attributes: Record<string, unknown>,
  defaultRole: Role,
): RoleAssignment {
  for (const rule of rules) {
    const values = readClaimValues(attributes, rule.claimPath)
    if (values.length > 0 && matches(rule, values)) {
      return { role: rule.role, roleId: rule.roleId ?? null }
    }
  }
  return { role: defaultRole, roleId: null }
}

/** The scope an IdP identity resolves to — same shape `AdminStore.setUserScope` takes. */
export interface ScopeAssignment {
  mode: 'all' | 'restricted'
  grants: ScopeGrant[]
  /** True when no rule matched and the provider default was used. */
  fromDefault: boolean
}

/**
 * Resolve the tenant scope for an authenticated identity. Pure — no I/O.
 *
 * Every matching rule contributes its tenants (a union, not first-match), and
 * a tenant granted `'*'` by any rule covers every vertical. When no rule
 * matches, the provider's default scope applies: `all`, or `restricted` to
 * its default tenants (every vertical). A matching rule whose tenant list is
 * `['*']` grants every tenant (`all`) — how "the platform team sees
 * everything" is written next to narrower rules.
 */
export function resolveScope(
  rules: ScopeMappingRuleRow[],
  attributes: Record<string, unknown>,
  provider: Pick<IdentityProviderRow, 'defaultScopeMode' | 'defaultTenantIds'>,
): ScopeAssignment {
  const byTenant = new Map<string, '*' | Set<string>>()
  let matched = false
  let everyTenant = false
  for (const rule of rules) {
    const values = readClaimValues(attributes, rule.claimPath)
    if (values.length === 0 || !matches(rule, values)) continue
    matched = true
    if (rule.tenantIds.includes('*')) {
      everyTenant = true
      continue
    }
    for (const tenantId of rule.tenantIds) {
      const current = byTenant.get(tenantId)
      if (rule.verticals === '*' || current === '*') {
        byTenant.set(tenantId, '*')
        continue
      }
      const set = current ?? new Set<string>()
      for (const v of rule.verticals) set.add(v)
      byTenant.set(tenantId, set)
    }
  }
  if (!matched) {
    if (provider.defaultScopeMode !== 'restricted') return { mode: 'all', grants: [], fromDefault: true }
    return {
      mode: 'restricted',
      grants: [...new Set(provider.defaultTenantIds)].sort().map((tenantId) => ({ tenantId, verticals: '*' })),
      fromDefault: true,
    }
  }
  if (everyTenant) return { mode: 'all', grants: [], fromDefault: false }
  return {
    mode: 'restricted',
    grants: [...byTenant.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([tenantId, v]) => ({ tenantId, verticals: v === '*' ? '*' : [...v].sort() })),
    fromDefault: false,
  }
}
