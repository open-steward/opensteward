/**
 * JIT provisioning + role- and scope-mapping application.
 *
 * On every successful SSO/LDAP auth: find the identity link; create the local
 * user on first login (when jit_enabled) with an UNUSABLE password so it can
 * never be used for local login; apply role mapping and scope mapping
 * (re-synced each login).
 *
 * Scope is only written for users whose `scope_source` is `idp` — every
 * JIT-created user starts that way. A user an admin scoped by hand
 * (`scope_source = 'manual'`) keeps that scope; the IdP does not overwrite a
 * deliberate decision made in the console.
 */
import bcrypt from 'bcrypt'
import { randomBytes } from 'crypto'
import type { AdminStore, UserRow } from '../../db/admin-store'
import type { IdentityProviderRow, IdentityStore } from '../../db/identity-store'
import type { ResolvedIdentity } from './types'
import { resolveRoleAssignment, resolveScope, type RoleAssignment } from './role-mapping'

export class JitDisabledError extends Error {
  constructor() {
    super('No matching account and just-in-time provisioning is disabled for this provider.')
    this.name = 'JitDisabledError'
  }
}

/** A bcrypt hash of random bytes — valid format, but no one knows the input,
 *  so bcrypt.compare can never succeed. Marks SSO-only accounts. */
async function unusablePasswordHash(): Promise<string> {
  return bcrypt.hash(randomBytes(32).toString('hex'), 12)
}

async function deriveUsername(adminStore: AdminStore, identity: ResolvedIdentity): Promise<string> {
  const base = (identity.email || identity.externalId).slice(0, 60)
  if (!(await adminStore.getUserByUsername(base))) return base
  // Collision with an existing (likely local) user — suffix to disambiguate.
  for (let i = 0; i < 1000; i++) {
    const candidate = `${base.slice(0, 54)}-${randomBytes(3).toString('hex')}`
    if (!(await adminStore.getUserByUsername(candidate))) return candidate
  }
  throw new Error('Could not derive a unique username')
}

export interface ProvisionResult {
  user: Pick<UserRow, 'id' | 'username' | 'role'>
  created: boolean
  roleChanged: boolean
}

/**
 * Apply an already-resolved role to an existing user. Returns whether the
 * stored role changed. A rule naming a custom role that no longer exists
 * (deleting a role a rule uses is refused, so only a hand-edited database)
 * falls back to the provider default rather than to the rule's base role,
 * which could grant more than the missing role did.
 */
async function applyRole(
  adminStore: AdminStore,
  user: UserRow,
  mapped: RoleAssignment,
  fallback: UserRow['role'],
): Promise<{ role: UserRow['role']; changed: boolean }> {
  if (mapped.roleId) {
    if (user.role_id === mapped.roleId && user.role === mapped.role) {
      return { role: user.role, changed: false }
    }
    const updated = await adminStore.assignUserRole(user.id, mapped.roleId)
    if (updated) return { role: updated.role, changed: true }
    mapped = { role: fallback, roleId: null }
  }
  if (user.role === mapped.role && !user.role_id) return { role: user.role, changed: false }
  await adminStore.setUserRole(user.id, mapped.role)
  return { role: mapped.role, changed: true }
}

/**
 * Re-derive a linked user's role and (when IdP-owned) scope from the
 * provider's rules. Shared by the login path below and SCIM group changes.
 */
export async function applyIdpMapping(
  adminStore: AdminStore,
  identityStore: IdentityStore,
  provider: IdentityProviderRow,
  user: UserRow,
  attributes: Record<string, unknown>,
): Promise<{ role: UserRow['role']; roleChanged: boolean }> {
  const mapped = resolveRoleAssignment(
    await identityStore.listRules(provider.id),
    attributes,
    provider.defaultRole,
  )
  const { role, changed } = await applyRole(adminStore, user, mapped, provider.defaultRole)
  // Admins always see every tenant (the store cleared any stored scope when
  // the role was applied); scope rules only ever narrow non-admins.
  if (user.scope_source === 'idp' && role !== 'admin') {
    const scope = resolveScope(await identityStore.listScopeRules(provider.id), attributes, provider)
    const current = await adminStore.getUserScope(user.id)
    const same =
      current !== null &&
      current.mode === scope.mode &&
      JSON.stringify(current.grants) === JSON.stringify(scope.grants)
    if (!same) await adminStore.setUserScope(user.id, scope, 'idp')
  }
  return { role, roleChanged: changed }
}

export async function provisionAndMap(
  adminStore: AdminStore,
  identityStore: IdentityStore,
  provider: IdentityProviderRow,
  identity: ResolvedIdentity,
  opts: { scimManaged?: boolean } = {},
): Promise<ProvisionResult> {
  const link = await identityStore.findLink(provider.id, identity.externalId)
  if (link) {
    const existing = await adminStore.getUserById(link.userId)
    if (!existing) {
      // Orphaned link (user deleted) — drop it and fall through to re-provision.
      await identityStore.deleteLinksForUser(link.userId)
    } else {
      const { role, roleChanged } = await applyIdpMapping(
        adminStore,
        identityStore,
        provider,
        existing,
        identity.attributes,
      )
      await identityStore.touchLinkLogin(link.id)
      return {
        user: { id: existing.id, username: existing.username, role },
        created: false,
        roleChanged,
      }
    }
  }

  if (!provider.jitEnabled) throw new JitDisabledError()

  const mapped = resolveRoleAssignment(
    await identityStore.listRules(provider.id),
    identity.attributes,
    provider.defaultRole,
  )
  const username = await deriveUsername(adminStore, identity)
  // Created with the base role first; the IdP owns this user's scope from
  // here on (`scope_source = 'idp'`), so applyIdpMapping writes it below.
  const created = await adminStore.createUser(username, await unusablePasswordHash(), mapped.role, {
    scopeSource: 'idp',
  })
  const { role } = await applyIdpMapping(adminStore, identityStore, provider, created, identity.attributes)
  const newLink = await identityStore.createLink({
    providerId: provider.id,
    externalId: identity.externalId,
    userId: created.id,
    scimManaged: opts.scimManaged,
  })
  await identityStore.touchLinkLogin(newLink.id)
  return { user: { id: created.id, username: created.username, role }, created: true, roleChanged: false }
}
