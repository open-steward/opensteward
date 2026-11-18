/**
 * Operator permission catalog — the fine-grained capabilities an admin-console
 * user can hold, independent of the three coarse built-in roles.
 *
 * The built-in roles (`viewer`, `operator`, `admin`) keep working exactly as
 * before: `users.role` is still the base role that `operatorOnly`/`adminOnly`
 * and the JWT carry. Each built-in role maps to a fixed permission set below,
 * defined in code rather than in the database so an upgrade that adds a
 * permission grants it to admins without a data migration. Custom roles store
 * their own set and are resolved by admin-api (`core/auth/access.ts`).
 *
 * Lives in `@opensteward/shared` because more than one service reads it:
 * admin-api enforces it, the admin UI hides navigation by it, and
 * integration-server's data-access routes receive a caller's permissions and
 * scope when admin-api proxies to them.
 */

/** Every permission, in display order. Adding one here grants it to `admin`. */
export const PERMISSIONS = [
  'connections:read',
  'connections:manage',
  'data:read',
  'data:read_pii',
  'data:export',
  'dashboards:view',
  'dashboards:edit',
  'dashboards:share_all',
  'destinations:manage',
  'sql_access:manage',
  'roles:manage',
  'users:manage',
  'settings:manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]

/** The three built-in roles. `users.role` always holds one of these. */
export const BUILTIN_ROLES = ['viewer', 'operator', 'admin'] as const
export type BuiltinRole = (typeof BUILTIN_ROLES)[number]

/** One-line explanations, for the admin UI and `GET /api/permissions`. */
export const PERMISSION_DESCRIPTIONS: Readonly<Record<Permission, string>> = {
  'connections:read': 'View connections, sync jobs and their health.',
  'connections:manage': 'Rename, revoke and sync connections, and set their sync schedule.',
  'data:read': 'Browse synced records, with PII fields masked.',
  'data:read_pii': 'Reveal masked PII fields in synced records (every reveal is audited).',
  'data:export': 'Export synced records as CSV or NDJSON.',
  'dashboards:view': 'View dashboards.',
  'dashboards:edit': 'Create and edit dashboards.',
  'dashboards:share_all':
    'Share dashboards with everyone, and choose who sees embedded Superset dashboards.',
  'destinations:manage': 'Configure warehouse and lake destinations.',
  'sql_access:manage': 'Provision read-only SQL access principals.',
  'roles:manage': 'Create, edit and delete custom roles.',
  'users:manage': "Assign users' roles and tenant scope, and edit IdP scope rules.",
  'settings:manage': 'Change deployment settings.',
}

const VIEWER: readonly Permission[] = ['connections:read', 'dashboards:view']
const OPERATOR: readonly Permission[] = [
  ...VIEWER,
  'connections:manage',
  'data:read',
  'data:export',
  'dashboards:edit',
]

/** Permission sets of the built-in roles. `admin` holds every permission. */
export const BUILTIN_ROLE_PERMISSIONS: Readonly<Record<BuiltinRole, readonly Permission[]>> = {
  viewer: VIEWER,
  operator: OPERATOR,
  admin: PERMISSIONS,
}

const PERMISSION_SET: ReadonlySet<string> = new Set(PERMISSIONS)

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && PERMISSION_SET.has(value)
}

export function isBuiltinRole(value: unknown): value is BuiltinRole {
  return typeof value === 'string' && (BUILTIN_ROLES as readonly string[]).includes(value)
}

/** The permission set of a built-in role; an unknown role gets none. */
export function permissionsForBuiltin(role: string): Set<Permission> {
  return isBuiltinRole(role) ? new Set(BUILTIN_ROLE_PERMISSIONS[role]) : new Set()
}

/**
 * Parse a stored or submitted permission list: keeps known permissions,
 * drops unknown strings (a permission removed in a later release must not
 * make every role that held it unreadable), de-duplicates, and returns them
 * in catalog order so two equal sets always serialise the same way.
 */
export function normalizePermissions(values: unknown): Permission[] {
  if (!Array.isArray(values)) return []
  const held = new Set(values.filter(isPermission))
  return PERMISSIONS.filter((p) => held.has(p))
}

/** Permissions in `requested` that `holder` does not have (catalog order). */
export function missingPermissions(
  holder: ReadonlySet<Permission>,
  requested: Iterable<Permission>,
): Permission[] {
  const want = new Set(requested)
  return PERMISSIONS.filter((p) => want.has(p) && !holder.has(p))
}
