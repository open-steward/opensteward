/**
 * Break-glass invariant — at least one password-usable local admin must
 * always exist and be able to log in, even when local login is disabled.
 *
 * A "local admin" is a user with the built-in role 'admin' — not a custom
 * role on an admin base, which may lack the permissions needed to repair
 * anything — who has NO SSO identity link (JIT/SCIM-provisioned users always
 * carry a link and use an unusable password hash). Guards every mutation that could orphan the last one:
 * disabling local login, deleting/deactivating a user, or demoting via
 * role mapping.
 */
import type { AdminStore } from '../../db/admin-store'
import type { IdentityStore } from '../../db/identity-store'

export class BreakGlassError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BreakGlassError'
  }
}

/** Ids of all password-usable local admins (built-in admin, no SSO link). */
export async function localAdminIds(adminStore: AdminStore, identityStore: IdentityStore): Promise<string[]> {
  const users = await adminStore.listUsers()
  const ids: string[] = []
  for (const u of users) {
    if (u.role === 'admin' && !u.role_id && (await identityStore.listLinksForUser(u.id)).length === 0) {
      ids.push(u.id)
    }
  }
  return ids
}

export async function isLocalAdmin(
  adminStore: AdminStore,
  identityStore: IdentityStore,
  userId: string,
): Promise<boolean> {
  return (await localAdminIds(adminStore, identityStore)).includes(userId)
}

/**
 * Throw BreakGlassError unless at least one local admin would remain after
 * removing `excludeUserId` (the user about to be deleted/demoted/deactivated).
 * Pass undefined to assert that any local admin exists at all.
 */
export async function assertBreakGlassPreserved(
  adminStore: AdminStore,
  identityStore: IdentityStore,
  excludeUserId?: string,
): Promise<void> {
  const remaining = (await localAdminIds(adminStore, identityStore)).filter((id) => id !== excludeUserId)
  if (remaining.length === 0) {
    throw new BreakGlassError(
      'Operation refused: it would leave no password-usable local admin (break-glass account).',
    )
  }
}
