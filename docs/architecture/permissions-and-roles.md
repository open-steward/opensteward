# Permissions, roles and tenant scope

> [← back to overview](./README.md)

Who may do what in the admin console, and which tenants they may see. This
builds on the three built-in roles described in
[auth-and-tenancy.md](./auth-and-tenancy.md#admin-roles). Nothing about those
roles changes. Two independent axes are layered on top of them:

- **Permissions** say what a user may *do*. They come from the user's role:
  either a built-in role, or a custom role that an admin defines.
- **Tenant scope** says which tenants' data a user may *see*. The default is
  `all`, which matches the behaviour before scopes existed. A user can instead
  be `restricted` to a list of tenants, and optionally to some verticals
  within each one.

Both axes are read from the database on every request. A change therefore
applies within seconds, without the user signing in again.

## Permission catalog

The catalog is defined in code, in `packages/shared/src/auth/permissions.ts`.
`GET /api/permissions` returns it.

| Permission | Allows | Built-in roles |
|---|---|---|
| `connections:read` | View connections, sync jobs and their health. | viewer, operator, admin |
| `connections:manage` | Rename, revoke and sync connections, and set their sync schedule. | operator, admin |
| `data:read` | Browse synced records, with PII fields masked. | operator, admin |
| `data:read_pii` | Reveal masked PII fields (every reveal is audited). | admin |
| `data:export` | Export synced records as CSV or NDJSON. | operator, admin |
| `dashboards:view` | View dashboards. | viewer, operator, admin |
| `dashboards:edit` | Create and edit dashboards. | operator, admin |
| `dashboards:share_all` | Share dashboards with everyone, and choose who sees embedded Superset dashboards. | admin |
| `destinations:manage` | Configure warehouse and lake destinations. | admin |
| `sql_access:manage` | Provision read-only SQL access principals. | admin |
| `roles:manage` | Create, edit and delete custom roles. | admin |
| `users:manage` | Assign roles and tenant scope, and edit IdP scope rules. | admin |
| `settings:manage` | Change deployment settings. | admin |

### What the data and dashboard permissions unlock

| Permission | admin-api | Admin UI |
|---|---|---|
| `data:read` | `GET /api/data/summary`, `/api/data/schema/:vertical/:type`, `/api/data/connections/:id/resources/:type` (list) and `…/:rid` (detail). Records always come back **masked**: personal-data fields masked, secrets removed, financial fields masked when `data_access.mask_financial` is on. Filters and search only on fields the caller may search. | The **Data** nav item, `/data`, `/data/connections/:id`, the record view, and **Browse data** on a connection page. |
| `data:read_pii` | `POST /api/data/connections/:id/resources/:type/:rid/reveal` (with `data:read`) — the unmasked record, audited as `data.pii_reveal` before it is returned; `include_pii=true` on the export (with `data:export`). Never makes the list or detail routes unmask. | The **Reveal personal data** form on a record and the **Include personal data** export checkbox. |
| `data:export` | `GET /api/data/connections/:id/resources/:type/export` — CSV or NDJSON, streamed, masked like the list; audited as `data.export`. | The Export panel on `/data/connections/:id`. |
| `dashboards:view` | `GET /api/dashboards` (built-ins plus dashboards whose audience matches the caller: their own, those shared with a tenant in their access, those shared with everyone; a pinned dashboard is also hidden when none of its pins are in their access; an admin with access to every tenant sees all), `/api/dashboards/:id` (`404` outside the audience), `/api/dashboards/metrics`, `/api/dashboards/metrics/:id` and `/api/dashboards/currencies` (`?dashboard=<id>` applies that dashboard's pinned tenants: caller scope ∩ pins; `?connection=` and `?platform=` narrow further to one connection and / or adapter, kept to `?vertical=` when given, and also need `connections:read` (`403` otherwise); a connection outside the scope yields no data). `GET /api/dashboards/connections`, the connections and adapters a dashboard's filter offers, needs **both** `dashboards:view` and `connections:read`: it lists only the caller's in-scope connections (∩ the dashboard's pins), with id, label, adapter and vertical only. Metric values are computed for the caller's tenant scope; no metric reads a PII or secret field. Also covers **embedded Superset** (when configured): `GET /api/analytics/superset/status`, `/api/analytics/superset/dashboards` (only dashboards whose extra permission the caller holds, whose verticals their scope reaches and whose audience matches them) and `POST /api/analytics/superset/guest-token` — a 5-minute guest token whose row-level-security clause is the caller's tenant scope narrowed to the dashboard's pinned tenants; `403` `SCOPE_EMPTY` for a caller restricted to no tenants. | The **Dashboards** nav item, `/dashboards` (with a **Custom dashboards (Superset)** section when configured), `/dashboards/:id` (its connection / adapter filter also needs `connections:read`), `/dashboards/superset/:id`. |
| `dashboards:edit` | `POST /api/dashboards`, and `PATCH`/`DELETE /api/dashboards/:id` on dashboards the caller owns (admins: any). Built-ins are read-only (`409`). A caller with restricted access may share with and pin only tenants in their own access (`403` otherwise); a sharing change is audited as `dashboard.share`. | **New dashboard**, the editor, delete. |
| `dashboards:share_all` | Sets the `everyone` audience on a native dashboard (`POST`/`PATCH /api/dashboards`), and `PATCH /api/analytics/superset/dashboards/:id`, which chooses who sees an embedded Superset dashboard (audited as `superset.share`). The permission only counts for a caller with access to every tenant (a tenant-restricted holder gets `403`, and sees only their own tenant ids), because `everyone` and registry entries are deployment-wide. Sharing with specific tenants needs only `dashboards:edit`. | The **Everyone** option in the dashboard editor, and `/dashboards/superset/:id/sharing`. |
| `destinations:manage` | Every `/api/destinations/*` route: the type catalog, list, create, read, patch, delete, credential replacement, connection test, run now, backfill and run history. A destination is visible and changeable only when its scope lies inside the caller's (`404` otherwise); a create or change that would widen it answers `403` `SCOPE_EXCEEDS_CALLER`. Turning on `includePii` (and re-pointing a PII destination's config, scope or credentials) also needs `data:read_pii` (`403` `PII_NOT_PERMITTED`); the caller is recorded as approver. | The **Destinations** item in the Admin group, `/destinations`, the create form and the detail page. The include-PII control appears only with `data:read_pii`. |
| `sql_access:manage` | `/api/sql-access/status`, `provision`, `provision-script` and the principal routes (list, create, rotate, revoke). A principal's tenants and verticals must lie inside the caller's scope (`403` `SCOPE_EXCEEDS_CALLER`); an unmasked (PII) principal also needs `data:read_pii` (`403` `PII_NOT_ALLOWED`), and PII principals are invisible to callers without it. Provisioning needs an all-tenant scope. `GET /api/sql-access/catalog` needs only `data:read`. | The **SQL access** item in the Admin group, `/sql-access` (the catalog section only with `data:read`), the new-login form and the one-time password page. The unmasked option appears only with `data:read_pii`. |

Tenant scope applies to all of it: admin-api sends the caller's scope with
every data request (`X-OpenSteward-Data-Scope`) and integration-server
re-checks each connection's owner tenant, so a restricted user's lists,
counts, exports and dashboard numbers cover only their tenants, and another
tenant's connection answers `404`. See [data-access.md](./data-access.md).

The permission sets of the built-in roles also live in code
(`BUILTIN_ROLE_PERMISSIONS`). When a release adds a permission, admins get it
immediately, with no data migration.

## Roles

`admin_store` v3 adds a `roles` table. It is seeded with one row for each
built-in role (`viewer`, `operator`, `admin`), so role pickers can list them.
Built-in roles cannot be changed: `PATCH` and `DELETE` on them answer `409`.

A **custom role** has three parts:

- a name, which is unique regardless of case;
- a **base role**, which must be one of the built-ins;
- its own permission list.

The base role matters for backward compatibility:

- `users.role` always holds the base role. For a user on a custom role, that
  is the custom role's base.
- `users.role_id` points at the custom role. It is `NULL` when the user holds
  a built-in role directly.
- Everything that reads `users.role` keeps working unchanged: the JWT claim
  (informational), `operatorOnly`/`adminOnly`, and the admin UI's role checks.
- Routes gated by role check the base role. Routes gated by permission check
  the custom role's permissions.

A route can check both. Scope rules, for example, require the admin role and
`users:manage`.

The JWT is minted at sign-in and carries the role it had then, but role-gated
routes do not trust it: `requireRole` reads the current base role from the
database, so a base-role change applies (like permissions and scope) within
seconds, not at the next sign-in.

| Route | Needs |
|---|---|
| `GET /api/permissions` | any signed-in user |
| `GET /api/roles`, `GET /api/roles/:id` | `roles:manage` or `users:manage` |
| `POST/PATCH/DELETE /api/roles…` | `roles:manage` |
| `PUT /api/users/:id/role` `{roleId}` | `users:manage` |
| `PUT /api/users/:id/scope` `{mode, grants, source?}` | `users:manage` |
| `GET /api/auth/me` | any signed-in user; now includes `roleId`, `roleName`, `permissions` and `scope` |

A role that is in use cannot be deleted (`409`). That covers roles assigned to
a user and roles named by an IdP role-mapping rule. Reassign the users or
remove the rules first.

## Tenant scope

Scope is stored in `users.scope_mode` and the `user_scopes` table. Each
`user_scopes` row is a `(user_id, tenant_id, vertical)` triple, and the
vertical `'*'` means every vertical of that tenant. `users.scope_source`
records who owns the scope:

- `manual`: an admin set it in the console.
- `idp`: identity-provider scope rules set it, and re-apply them at every SSO
  sign-in.

For a restricted user, admin-api does the following:

- **Filters.** `GET /api/connections`, `GET /api/sync-jobs`, `GET /api/tenants`
  and `GET /api/tenant-domains` return only rows owned by granted tenants and
  verticals. A connection with no tenant is hidden. Totals are counted after
  the filter, so `meta.total` never reveals rows the user cannot see.
- **404s.** A connection, sync job, tenant or domain outside the scope answers
  `404`, exactly as a missing one does, so the response never confirms that an
  id exists. This covers reads and writes: connection rename and revoke, sync
  create and cancel, and tenant rename and delete.
- **Fails closed** with `403` and `{ error: { code: "SCOPE_RESTRICTED" } }` on
  surfaces that are not tenant-scoped yet:
  - end-users, connect sessions, API keys, webhook subscriptions, end-user
    tokens, OAuth clients, Connect Link templates, the audit log and data-store
    metrics;
  - creating a tenant.

Unrestricted users see no change in any of this.

### Admins are always unrestricted

A user whose base role is `admin` always sees every tenant and cannot be
restricted:

- `loadAccess` returns scope `all` for an admin without reading
  `user_scopes`, so the tenant checks, the data-scope header, Superset
  row-level security and `/api/auth/me` all agree, even if a stale row exists.
- `PUT /api/users/:id/scope` with `mode: "restricted"` for an admin is
  refused (`400`).
- Promotion lifts a restriction. Making a user an admin (`setUserRole`,
  `assignUserRole`, or a custom role's base role changing to `admin`) sets
  their scope to `all` and deletes their grants in the same transaction, so a
  later demotion never resurrects the old restriction. The audit entry
  (`user.role_assign` or `user.update`) records `scopeCleared: true`, and the
  console warns before saving.
- A custom role cannot be changed to an admin base while any holder is
  restricted (`409`): give those users every tenant first, or use another role.
- **Per-tenant administration** is a custom role (base `operator`, plus
  `users:manage`) restricted to its tenants, not an admin.
- **Last admin.** The [break-glass floor](./sso-and-identity-providers.md)
  already guarantees a password-usable built-in admin exists. That admin is
  always unrestricted.
- **SSO.** A group mapped to an admin role means every tenant; scope rules only
  ever narrow non-admins.

### Deployment-wide surfaces refuse restricted users

Some routes change what every tenant gets. A user restricted to some tenants
is refused on them with `403 SCOPE_RESTRICTED` (`denyRestrictedScope`),
whatever their role or permissions:

- platform configuration, enable and disable
  (`/api/verticals/:vertical/platforms/:slug/{config,enable,disable}`);
- scope groups (create, edit, delete);
- role writes (create, edit, delete). `GET /api/roles` stays readable so a
  restricted role manager can still assign roles within their tenants;
- dashboard-task dismissals;
- notification acknowledgement.

Notification reads fail closed with an empty list and a zero count instead of
a `403`, because every page polls the bell. Routes that list the whole catalog
stay readable: `GET /api/platforms*` (except `…/config`), `GET /api/scope-groups`,
`GET /api/roles*` and `GET /api/dashboard-tasks/dismissals`.
`tests/unit/route-access.test.ts` pins the list in `INSTANCE_WIDE`: every
route on it must carry the `scope-deny` guard.

The resolved scope can be serialised with `toProxyScope()` as
`{ tenants: '*' }` or `{ tenants: [...], verticals: { <tenant>: '*' | [...] } }`
— note the `verticals` map is keyed by **tenant**. The data routes
(`routes/data.ts`, `buildDataScope`) send it to integration-server as
`{ tenants, tenantVerticals }`, which is how its data-access routes re-check
ownership, per tenant and vertical, themselves.

## Escalation guards

Nobody can hand out more than they hold:

- **Permissions and base role.** Creating a role, editing it, assigning it to a
  user, or naming it in an IdP role-mapping rule are all refused (`403`) if the
  role grants a permission the caller lacks, or a base role above the caller's.
- **Roles above the caller.** Editing or deleting a role that holds more than
  the caller is refused. So is changing the role of a user who holds more than
  the caller.
- **Scope.** A restricted caller can grant only tenants, and verticals within
  them, that it holds itself. It can never grant `all`, and it can only act on
  users whose current scope is inside its own. When it creates a user, the new
  user starts with the caller's own scope.
- **Break-glass.** Moving the last password-usable **built-in** admin off the
  admin role is refused (`409`), and so is moving it to a custom role on an
  admin base. Only built-in admins count toward the
  [break-glass floor](./sso-and-identity-providers.md), because a custom admin
  role may lack the permissions needed to repair anything.
- **Own role.** Nobody can change their own role.

### Profile pictures

`PUT` and `DELETE /api/users/:id/avatar` are guarded by sign-in alone, on
purpose: every console user may set or remove their **own** picture. For
anyone else's, the handler requires `users:manage` and then applies the two
guards above — the account must not hold a permission or base role the caller
lacks, and a restricted caller may only act on accounts whose scope is inside
its own (`403` otherwise). `GET /api/users/:id/avatar` is open to any
signed-in user. The route access gate pins that these three routes carry the
JWT guard and nothing else, so moving them under the admin-only users plugin
would fail it.

An email change (`PATCH /api/users/:id` with `email`) stays admin-only, like
every other field of that route, and passes the same target guard: a change to
another account that holds more than the caller is refused (`403`), so a thin
admin-based role cannot rewrite a full admin's email.

## Resolution and caching

The code is `apps/admin-api/src/core/auth/access.ts`.

- `resolveAccess(store, userId)` returns
  `{ baseRole, roleId, roleName, permissions, scope }`. It is cached per user
  for 15 seconds.
- Every write path invalidates the cache: the store methods `setUserRole`,
  `assignUserRole`, `setUserScope`, `updateRole`, `deleteRole` and
  `deleteUser` all call `invalidateAccess`. On one replica a change is
  therefore immediate. Across replicas it takes at most the TTL.
- A user whose row is gone resolves to no permissions and an empty restricted
  scope.
- An admin's scope is always `all`: the stored rows are not read.
- `server.ts` registers `accessResolver`, and `getAccess(request)` resolves
  through it once per request.
- `requireRole(min)` (`fastify.operatorOnly` / `adminOnly`) compares the
  resolved base role, not the JWT claim, so a demoted or deleted admin loses
  admin routes within about 15 seconds (at once on the same replica) instead of
  at token expiry. Without a resolver it falls back to the claim.
- `requirePermission(p)` is a preHandler factory that answers
  `403 Forbidden — missing permission <p>`. It is also exposed as
  `fastify.requirePermission`.
- `denyRestrictedScope` is the fail-closed hook. `tenantAllowed(access,
  tenant, vertical?)` is the check used in filters.
- Route unit tests that build a bare Fastify without a resolver get the
  pre-permission behaviour: built-in permissions for the JWT role, and scope
  `all`.
- Every guard (`requireAuth`, `requireRole`, `requirePermission`,
  `requireAnyPermission`, `denyRestrictedScope`, the service-secret and SCIM
  guards) carries a tag (`core/auth/route-access.ts`). `pnpm check:route-access`
  (`tests/unit/route-access.test.ts`) boots admin-api, reads those tags off
  every route, and fails when a route has no authentication guard outside its
  reasoned public allow-list, when a route in the tables above does not check
  the permission they list, or when a `denyRestrictedScope` route leaves `403`
  out of its OpenAPI responses.

The admin UI loads the same data from `GET /api/auth/me`, cached per session
token for 30 seconds. It uses it to hide navigation and to gate pages with
`requirePermission()` (`apps/admin/src/core/auth/middleware.ts`). These UI
checks are a convenience. admin-api enforces the real decision on every call.

## Identity providers

IdP role-mapping rules can grant a custom role through `roleId`. The rule
stores the role's base role alongside it.

Scope-mapping rules (`identity_store` v2) grant tenant scope from claims:

- Unlike role rules, **every** matching scope rule applies, and their tenants
  are combined.
- A tenant list of `["*"]` grants every tenant.
- When no rule matches, the provider's default scope applies. Providers that
  existed before scoping keep `all`; new providers start restricted to no
  tenants until an admin sets a default scope or adds rules.

Rules are re-applied at every SSO sign-in and on SCIM group changes, but only
to users whose `scope_source` is `idp`. Every JIT and SCIM user starts that
way. See [sso-and-identity-providers.md](./sso-and-identity-providers.md#scope-mapping)
and the [setup guide](../deployment/sso-setup.md#tenant-scope-from-idp-groups).

## Audit

New actions:

- `role.create`, `role.update`, `role.delete`
- `user.role_assign` with detail `{roleId, baseRole}`
- `user.scope_update` with detail `{mode, tenantIds}`
- `idp.scope_rule.create`, `idp.scope_rule.delete`
- `idp.default_scope.update`
- `data.pii_reveal` with detail `{connectionId, resourceType, resourceId, reason}`
- `data.export` with detail `{connectionId, resourceType, format, includePii}`
- `dashboard.create`, `dashboard.update`, `dashboard.delete` with detail `{name}`
- `superset.guest_token` with detail `{title, restricted}` — at most once per
  user and dashboard every 10 minutes (the embedded SDK refreshes tokens)
- `superset.registry_sync` with detail `{created, updated, removed}`, written
  as `system` when the superset-bootstrap job registers dashboards
- `destination.create` with detail `{destinationId, name, type, includePii, tenants}`
- `destination.update` with detail `{destinationId, name, fields, includePii}` —
  `fields` lists the settings the request changed
- `destination.delete` with detail `{destinationId, name}`
- `destination.run` with detail `{destinationId, runId}`
- `destination.backfill` with detail `{destinationId, vertical, resourceType, cursorsReset, runId}`
- `destination.credentials_rotate` with detail `{destinationId, secretFields}` —
  the names of the fields now set, never their values
- `destination.test` with detail `{destinationId, ok}`
- `sql_access.provision` with detail `{changed, version, breaking}`
- `sql_access.principal_create` with detail `{principalId, username, label, pii, tenants, verticals, expiresAt}`
- `sql_access.principal_rotate`, `sql_access.principal_revoke` with detail
  `{principalId, username, sessionsTerminated}`
- `user.avatar_update` with detail `{contentType, byteSize}`, and
  `user.avatar_delete`; `targetId` is the account, `userId` who did it. A
  picture fetched from the IdP at sign-in is not audited (the `sso.login`
  entry is).
- `user.create` gains `emailSet` and `user.update` gains `emailChanged` —
  flags only; an email address is never written to the audit log.

No destination secret and no SQL password ever reaches the audit log. The
password is returned once, in the create or rotate response
(`Cache-Control: no-store`), and is not stored or logged by admin-api.

## See also

- [auth-and-tenancy.md](./auth-and-tenancy.md): the five-layer auth model and
  the built-in roles
- [admin-page-map.md](./admin-page-map.md): every admin route by access level
- [data-access.md](./data-access.md): the data viewer and dashboards — flows,
  scope header, masking and audit
- [sso-and-identity-providers.md](./sso-and-identity-providers.md): SSO, SCIM,
  and role and scope mapping
