/**
 * @opensteward/sdk — generated module. DO NOT EDIT.
 *
 * Source: docs/openapi/admin-api.openapi.json
 * Generator: packages/sdk/scripts/sdk-codegen.ts (openapi-typescript)
 *
 * Regenerate via `pnpm sdk:generate` (also runs as part of
 * `pnpm docs:all`). CI fails if this file drifts from the source spec.
 */

export interface paths {
  '/version': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: {
      parameters: {
        query?: never
        header?: never
        path?: never
        cookie?: never
      }
      requestBody?: never
      responses: {
        /** @description Default Response */
        200: {
          headers: {
            [name: string]: unknown
          }
          content?: never
        }
      }
    }
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/auth/login': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * Sign in with username + password
     * @description Exchange a username and password for a JWT used to authenticate subsequent admin-api calls. No prior authentication required. Subject to lockout after repeated failures (returns `429`, with a `Retry-After` header for temporary locks). Returns `400` if either field is missing, `401` on invalid credentials, and `403` when local login is disabled and the account is not the pinned break-glass admin (SSO-only). Writes a `user.login` audit entry on success.
     */
    post: operations['auth.login']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/auth/has-users': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Whether any admin user exists yet (first-run check)
     * @description Read-only check the setup wizard uses to decide whether to show the first-run form. No authentication required and no side effects. Returns `{ hasUsers: false }` on a fresh deployment, `{ hasUsers: true }` once the first admin has been created.
     */
    get: operations['auth.hasUsers']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/auth/setup': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * First-run admin bootstrap (only succeeds when no users exist)
     * @description Bootstrap the first `admin` account on a fresh deployment and return a JWT for it. Only succeeds while the user table is empty — returns `409` once any user exists. When the server is started with a `BOOTSTRAP_TOKEN`, the matching token must be supplied in the `X-Bootstrap-Token` header (else `401`), so a fresh or wiped deployment cannot be claimed by an attacker. When NO token is configured, setup is refused from non-loopback addresses (`403`) — a remote first-run must carry a `BOOTSTRAP_TOKEN`; only a caller on the deployment host may set up tokenless. The created admin is auto-pinned as the break-glass account so SSO can be locked down later without losing password access. Returns `400` if username or password is missing.
     */
    post: operations['auth.setup']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/auth/me': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Return the calling user, with permissions and tenant scope
     * @description Return the decoded JWT claims (id, username, role) for the currently authenticated operator, plus the caller's effective role (`roleId`, `roleName`), `permissions` and tenant `scope`. The last three are read from the database on each call (cached for a few seconds), so they reflect a role or scope change made since the token was issued. Any authenticated operator may call this; useful for confirming a token is valid and discovering what the caller may do. Returns `401` if the token is missing or invalid.
     */
    get: operations['auth.me']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/users': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List admin / operator / viewer accounts
     * @description List all admin-console user accounts with their roles and timestamps. Admin role required. Credentials are never returned.
     */
    get: operations['users.list']
    put?: never
    /**
     * Create a new user account
     * @description Create a new admin-console user with the given username, password, and role (`admin`, `operator`, or `viewer`), and optionally an email address. Admin role required. Returns `400` for a missing/invalid field (including a malformed email), an over-long username, or a password that fails policy, and `409` if the username is already taken. Writes a `user.create` audit entry, which records that an email was set but never the address.
     */
    post: operations['users.create']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/users/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Get one console account
     * @description Read one console account with its identity-provider links and break-glass status. Admin role required. Pass `include_identity=true` to reveal each link’s `externalId` — the subject this account maps to in the identity provider, which is typically a work email. That privileged path writes a `user.pii_reveal` audit entry; without the flag the field is absent, not masked.
     */
    get: operations['users.get']
    put?: never
    post?: never
    /**
     * Delete a user account
     * @description Delete a user account and any linked SSO identities. Admin role required. Returns `400` if you attempt to delete your own account, `409` if removing this user would leave no break-glass admin, and `404` if no user matches the id. Writes a `user.delete` audit entry.
     */
    delete: operations['users.delete']
    options?: never
    head?: never
    /**
     * Change a console account’s role, password and/or email
     * @description Update an existing account in place, preserving the user id and any break-glass pin. Admin role required. Refuses changing your own role (`400`), a demotion that would leave no password-usable local admin (`409`), a password that fails policy (`400`), a malformed email (`400`), and any change to another account that holds more than you (`403`). An email set here is owned by the console and SSO no longer overwrites it; `null` clears it. Writes a `user.update` audit entry (neither the password nor the email address is ever recorded — only `passwordChanged` / `emailChanged` flags).
     */
    patch: operations['users.update']
    trace?: never
  }
  '/api/users/{id}/avatar': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    /**
     * Upload a console user's profile picture
     * @description Store a profile picture (PNG, JPEG or WebP, at most 512 KB) for a console account, replacing any existing one — including one fetched from the identity provider, which SSO then no longer replaces. Any signed-in user may set their own; setting another user’s needs `users:manage`, and is refused (`403`) when that account holds more than you or sees tenants outside your scope. The type is identified from the bytes: `415` for anything else (SVG included, whatever the data URL declares), `413` when too large, `400` when `data` is not base64. `404` for an unknown user. Writes a `user.avatar_update` audit entry.
     */
    put: operations['users.avatar.put']
    post?: never
    /**
     * Remove a console user's profile picture
     * @description Remove a console account’s profile picture, whichever source it came from; the console then shows initials. Idempotent (`204` when there was none). Any signed-in user may remove their own; removing another user’s needs `users:manage`, with the same `403` escalation guards as uploading. A picture sourced from the identity provider comes back at the next SSO sign-in if the IdP still sends one. `404` for an unknown user. Writes a `user.avatar_delete` audit entry when a picture was removed.
     */
    delete: operations['users.avatar.delete']
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/permissions': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List the permission catalog
     * @description List every permission a role can grant, what it allows, and which built-in roles hold it. Any authenticated user.
     */
    get: operations['permissions.list']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/roles': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List roles
     * @description List the three built-in roles followed by every custom role, each with its effective permissions. Requires `roles:manage` or `users:manage`.
     */
    get: operations['roles.list']
    put?: never
    /**
     * Create a custom role
     * @description Create a custom role from a base role and a permission set. Requires `roles:manage`. Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant. Returns `403` when the role would grant a permission or base role you do not hold yourself, and `409` when the name is taken (case-insensitively). Writes a `role.create` audit entry.
     */
    post: operations['roles.create']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/roles/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Read one role
     * @description Read a built-in or custom role by id. Requires `roles:manage` or `users:manage`. Returns `404` if no role matches.
     */
    get: operations['roles.get']
    put?: never
    post?: never
    /**
     * Delete a custom role
     * @description Delete a custom role. Requires `roles:manage`. Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant. Returns `404` if it does not exist, `403` if it grants more than you hold, and `409` for a built-in role or one still in use — assigned to a user or named by an identity-provider role-mapping rule. Reassign those first. Writes a `role.delete` audit entry.
     */
    delete: operations['roles.delete']
    options?: never
    head?: never
    /**
     * Edit a custom role
     * @description Edit a custom role; omitted fields are unchanged. A base-role change is applied to every holder at once. A role cannot become admin-based while any holder is limited to specific tenants (`409`): admins always have every tenant. Requires `roles:manage`. Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant. Returns `404` if the role does not exist, `409` for a built-in role (they are immutable) or a taken name, and `403` when either the role as it stands or the edit would grant a permission or base role you do not hold. Holders see the change within seconds; role-gated routes read the current base role from the database, not the sign-in token. Writes a `role.update` audit entry.
     */
    patch: operations['roles.update']
    trace?: never
  }
  '/api/users/{id}/role': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    /**
     * Assign a console user's role
     * @description Assign a built-in or custom role to a console user. `users.role` is set to the role’s base role in the same write. Requires `users:manage`. Returns `404` for an unknown user, `400` for an unknown role or an attempt to change your own role, `403` when either the new role or the user’s current role grants more than you hold, or the user sees tenants you cannot, and `409` when it would demote the last password-usable local admin. Permissions change within seconds; role-gated routes read the current base role from the database, not the sign-in token. Making a user an admin gives them every tenant: a tenant restriction is cleared (audited as `scopeCleared`). Writes a `user.role_assign` audit entry.
     */
    put: operations['users.role.assign']
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/users/{id}/scope': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    /**
     * Set a console user's tenant scope
     * @description Restrict a console user to specific tenants (optionally specific verticals within them), or give them every tenant with `mode: "all"`. Requires `users:manage`. A restricted user sees only granted tenants’ connections, sync jobs and tenants, gets `404` for anything else, and is refused (`403 SCOPE_RESTRICTED`) on surfaces that are not tenant-scoped yet. An admin cannot be restricted (`400`): admins always have every tenant. Returns `404` for an unknown user, `400` for an unknown tenant, and `403` when either the requested scope or the user’s current one reaches beyond yours. Takes effect within seconds. Writes a `user.scope_update` audit entry.
     */
    put: operations['users.scope.update']
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/verticals': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List enabled verticals + per-vertical health
     * @description List the configured verticals along with a live health check for each (e.g. whether its backing service is reachable). Any authenticated operator. Useful for a system-status dashboard.
     */
    get: operations['verticals.list']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/connections': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List connections across every configured vertical
     * @description List all active integration connections aggregated across every configured vertical, with optional filters for `vertical`, `status`, `platform`, per-column filters (`f_label`, `f_id`, `f_vertical`, `f_status`, `f_platform`, `f_tenant`), a `search` over connection id and label, and `sort`/`dir` to order the result. Filters apply before pagination, so `meta.total` reflects the filtered set, and sorting is applied before the slice, so every page reflects the requested order. A tenant-restricted caller sees only connections owned by its granted tenants (and verticals); connections with no tenant are hidden from it. Any authenticated operator.
     */
    get: operations['connections.list']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/connections/{vertical}/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Fetch a single connection
     * @description Fetch one connection by its vertical and id. Any authenticated operator. Returns `404` if the vertical is unknown, no connection with that id exists in it, or the connection belongs to a tenant outside the caller's scope.
     */
    get: operations['connections.get']
    put?: never
    post?: never
    /**
     * Revoke a connection
     * @description Revoke a connection by vertical and id, deleting its stored credentials. Operator role or higher. Returns `404` if the vertical is unknown or the connection is not found. Writes a `connection.delete` audit entry.
     */
    delete: operations['connections.delete']
    options?: never
    head?: never
    /**
     * Rename a connection
     * @description Rename a connection by vertical and id. The label is the only mutable field — it is what the admin UI and `GET /api/connections?search=` match on, so it is how an operator tells two connections to the same platform apart. Send `null` to clear it. Operator role or higher. Returns `404` if the vertical is unknown or the connection is not found, and `409` if another connection for the same tenant and platform already carries that label. Writes a `connection.update` audit entry.
     */
    patch: operations['connections.update']
    trace?: never
  }
  '/api/connections/{vertical}/{id}/sync-schedule': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    /**
     * Set a connection's sync schedule
     * @description Choose how often a connection's data is re-synced: `default` (the deployment interval), `custom` (every `intervalMinutes`, 15–43200), `trigger_only` (only when a sync is requested — never automatically) or `once` (one sync when connected). Takes effect on the scheduler's next tick. Operator role or higher. Returns `404` if the vertical is unknown, the connection is not found, or it belongs to a tenant outside the caller's scope; `400` for an invalid schedule. Writes a `connection.sync_schedule` audit entry with the previous and new schedule.
     */
    put: operations['connections.setSyncSchedule']
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/notifications': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List unacknowledged notifications
     * @description List notifications that have not yet been acknowledged (e.g. connection errors or sync alerts surfaced to operators). Any authenticated operator. A tenant-restricted user gets none (notifications are not tenant-scoped yet).
     */
    get: operations['notifications.list']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/notifications/unread-count': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Count unread notifications
     * @description The number of unacknowledged notifications, excluding `credential_expiring` (it auto-heals within a poll, so counting it would keep the header bell from ever reading zero). Any authenticated operator. A tenant-restricted user gets none (notifications are not tenant-scoped yet).
     */
    get: operations['notifications.unread-count']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/notifications/{id}/acknowledge': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * Acknowledge a single notification
     * @description Mark a single notification as acknowledged so it drops out of the unacknowledged list. Operator role or higher. Returns `404` if no notification matches the id. Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant.
     */
    post: operations['notifications.acknowledge']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/notifications/acknowledge-all': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * Acknowledge every notification
     * @description Acknowledge every outstanding notification in one call, clearing the unacknowledged list. Operator role or higher. Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant.
     */
    post: operations['notifications.acknowledge-all']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/audit/actions': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Every audit action the registry knows
     * @description The typed action vocabulary, for building filter UIs without hand-typing exact dotted action literals. Admin role required.
     */
    get: operations['audit.actions']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/audit': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List audit-log entries, newest first
     * @description List operator audit-log entries (paginated, newest first; `limit` capped at 200). Admin role required. Supports filtering by `action`, `user_id`, `target_id` (exact match on the acted-on id — “everything that happened to key X”), `vertical` (case-insensitive substring), and a `from`/`to` date range (ISO-8601 or epoch-ms), plus `sort`/`dir` to order the result. Filters and ordering are applied in SQL before the page slice, so `meta.total` reflects the filtered set and every page reflects the requested order.
     */
    get: operations['audit.list']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/audit/export': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Export audit-log entries as CSV or JSON
     * @description Export the (optionally filtered) audit log as a downloadable `csv` (default) or `json` attachment, supporting the same filters as the list endpoint. Admin role required. Streamed from a SQLite cursor so large logs do not materialise at once, and the export itself is recorded as an `audit.export` audit entry.
     */
    get: operations['audit.export']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/platforms': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List platforms across every vertical
     * @description List every available platform (integration adapter) across all verticals, with optional `vertical` and free-text `search` filters. Any authenticated operator. Includes each platform's `authType` and enabled state.
     */
    get: operations['platforms.list']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/platforms/status': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List operator enable/config state for every platform
     * @description List every platform across every vertical with its operator-facing enabled/config state. The all-verticals counterpart of `/api/verticals/{vertical}/platforms`; each row carries the `vertical` it belongs to. Any authenticated operator. Returns `502` if integration-server cannot be reached.
     */
    get: operations['platforms.list-status']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/verticals/{vertical}/platforms': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List platforms in one vertical
     * @description List the platforms available within a single vertical, with operator-facing enabled/config state. Any authenticated operator. Returns `404` if the vertical is unknown and `502` if integration-server cannot be reached.
     */
    get: operations['platforms.list-by-vertical']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/verticals/{vertical}/platforms/{slug}/config': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Read a platform's operator-set config (redacted)
     * @description Read the operator-managed configuration for a platform, with secret fields redacted. Operator role or higher. Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant. Returns `404` if the vertical or platform is unknown and `502` if integration-server cannot be reached.
     */
    get: operations['platforms.config.get']
    /**
     * Set a platform's operator-managed config
     * @description Set or replace the operator-managed configuration (credentials, keyed by `authType`) for a platform. Operator role or higher. Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant. Returns `404` if the vertical is unknown, `400` if the body lacks a `config` object, and `502` if integration-server cannot be reached. Writes an `adapter.config` audit entry.
     */
    put: operations['platforms.config.set']
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/verticals/{vertical}/platforms/{slug}/enable': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * Enable a platform with operator-supplied config
     * @description Enable a platform for a vertical, optionally applying operator credentials/config; omit `config` for adapters that need none. Operator role or higher. Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant. Returns `404` if the vertical is unknown and `502` if integration-server cannot be reached. Writes an `adapter.enable` audit entry.
     */
    post: operations['platforms.enable']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/verticals/{vertical}/platforms/{slug}/disable': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * Disable a platform
     * @description Disable a platform for a vertical so it can no longer be connected. Operator role or higher. Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant. Returns `404` if the vertical is unknown and `502` if integration-server cannot be reached. Writes an `adapter.disable` audit entry.
     */
    post: operations['platforms.disable']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/company-info': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Read the company-info record (auth-required)
     * @description Read the full company-info record (branding plus operator settings) so the admin UI can render the navbar logo and settings forms. Any authenticated operator. Returns `data: null` when no record has been saved yet.
     */
    get: operations['company-info.get']
    /**
     * Upsert the company-info record
     * @description Create or replace the single company-info record (branding and operator settings). Admin role required. Returns `400` with validation issues if the body fails schema validation. Writes a `company_info.update` audit entry.
     */
    put: operations['company-info.update']
    post?: never
    /**
     * Reset the company-info record to the defaults
     * @description Delete the company-info record (branding and operator settings), returning the deployment to the defaults it ships with: `GET /api/company-info` answers `data: null` again and every branded surface falls back to OpenSteward's own. Admin role required. Idempotent — resetting when nothing is saved also answers `204`. Writes a `company_info.reset` audit entry.
     */
    delete: operations['company-info.reset']
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/company-info/public': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Public branding subset (no auth)
     * @description Return only the public branding subset (name, logo, colours, support email, privacy/ToS links, base URL) with **no authentication**. Consumed server-to-server by the hosted Connect Link page to render the host's brand. Sensitive operator settings are never exposed here.
     */
    get: operations['company-info.get-public']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/end-users': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List end-users (Connect Link customers)
     * @description List end-users (the customers who authorize integrations through Connect Link), with optional `tenantId`, free-text `q`, and `limit`/`offset` pagination. Any authenticated operator. PII is omitted from the summary view.
     */
    get: operations['end-users.list']
    put?: never
    /**
     * Create a new end-user
     * @description Create a new end-user record. Operator role or higher. Writes an `end_user.create` audit entry.
     */
    post: operations['end-users.create']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/end-users/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Read a single end-user
     * @description Read one end-user by id. Any authenticated operator. Pass `include_pii=true` to reveal sensitive personal-ID fields — that privileged path requires the **admin** role (returns `403` otherwise) and writes an `end_user.pii_reveal` audit entry. Returns `404` if the end-user does not exist.
     */
    get: operations['end-users.get']
    put?: never
    post?: never
    /**
     * Delete an end-user
     * @description Delete an end-user record. Admin role required. Writes an `end_user.delete` audit entry.
     */
    delete: operations['end-users.delete']
    options?: never
    head?: never
    /**
     * Patch an end-user
     * @description Partially update an end-user; only the supplied fields are changed. Operator role or higher. Writes an `end_user.update` audit entry.
     */
    patch: operations['end-users.update']
    trace?: never
  }
  '/api/connect-sessions': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List Connect Link sessions
     * @description List Connect Link sessions (the hosted authorization flows end-users complete to link an integration), with optional filters for `tenantId`, `endUserId`, `status`, and `limit`/`offset` pagination. Any authenticated operator.
     */
    get: operations['connect-sessions.list']
    put?: never
    /**
     * Mint a Connect Link session
     * @description Mint a new Connect Link session and return its hosted authorization URL to hand to an end-user. Operator role or higher. The requesting operator is recorded as `created_by`. Writes a `connect_session.create` audit entry.
     */
    post: operations['connect-sessions.create']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/connect-sessions/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Read one Connect Link session
     * @description Read a single Connect Link session by id, including its current status. Any authenticated operator. Returns `404` if the session does not exist.
     */
    get: operations['connect-sessions.get']
    put?: never
    post?: never
    /**
     * Revoke a Connect Link session
     * @description Revoke a Connect Link session by id, invalidating its authorization URL immediately. Operator role or higher. Writes a `connect_session.revoke` audit entry.
     */
    delete: operations['connect-sessions.delete']
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/api-keys': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List tenant API keys (active + revoked)
     * @description List developer API keys (both active and revoked) for the deployment, optionally filtered to one tenant via `tenantId` and to one key mode via `mode`. Operator role or higher — an operator can check whether a key is active without being able to mint one. Returns key metadata only; the plaintext secret is never included.
     */
    get: operations['api-keys.list']
    put?: never
    /**
     * Mint a new tenant API key (plaintext returned once)
     * @description Mint a new tenant-scoped developer API key. Admin role required. The response includes the plaintext key **once** — it is not stored and cannot be retrieved again. Returns `400` if `tenantId` is missing. Writes an `api_key.mint` audit entry.
     */
    post: operations['api-keys.create']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/api-keys/{id}/rotate': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * Rotate a tenant API key (replacement plaintext returned once)
     * @description Mint a replacement key with the same tenant, label, scopes and mode, and schedule the old key’s revocation after a grace window (default 24h) in which both keys work — no downtime gap while the new key is rolled out. Admin role required. The response includes the replacement’s plaintext **once**. Returns `404` when the key does not exist, is revoked or expired, or was already rotated inside its grace window. Writes an `api_key.rotate` audit entry.
     */
    post: operations['api-keys.rotate']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/api-keys/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post?: never
    /**
     * Revoke a tenant API key
     * @description Permanently revoke a tenant API key by id, taking effect immediately. Admin role required. Returns `404` if no key matches the id. Writes an `api_key.revoke` audit entry.
     */
    delete: operations['api-keys.delete']
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/oauth/issuers': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List registered identity providers
     * @description Every identity provider whose OIDC bearer tokens this deployment will accept on `/v1/*`. Operator role or higher — reading which service accounts can reach the deployment does not require the ability to add one.
     */
    get: operations['oauth-clients.listIssuers']
    put?: never
    /**
     * Register an identity provider
     * @description Admin only. Audience is required: without it every token the issuer ever minted for any application would be accepted here.
     */
    post: operations['oauth-clients.createIssuer']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/oauth/readiness': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Whether OIDC bearer auth could admit anybody
     * @description Checked before allowing `auth.dev_api_keys_enabled` to be switched off, so that change cannot lock every developer out of a running deployment. Ready means an issuer is enabled, can admit somebody, and has already verified a real token.
     */
    get: operations['oauth-clients.readiness']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/oauth/presets': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Claim-name defaults for known identity providers
     * @description Keycloak, Auth0, Okta and Entra ID name the subject and scope claims differently. These are the defaults the admin form seeds from; the verifier itself is identical for every issuer.
     */
    get: operations['oauth-clients.listPresets']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/oauth/issuers/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** Get one issuer with its clients and scope rules */
    get: operations['oauth-clients.getIssuer']
    put?: never
    post?: never
    /**
     * Delete an identity provider
     * @description Removes the issuer along with its registered clients and scope rules. Tokens from it stop being accepted immediately.
     */
    delete: operations['oauth-clients.deleteIssuer']
    options?: never
    head?: never
    /** Update an identity provider */
    patch: operations['oauth-clients.updateIssuer']
    trace?: never
  }
  '/api/oauth/discover': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * Read an issuer discovery document
     * @description Fetches `{issuer}/.well-known/openid-configuration` and reports the signing-key endpoint, without saving anything, so an operator can check a URL before committing to it. The document's own issuer must match what was typed — otherwise a misconfigured or hostile endpoint could point the deployment at somebody else's signing keys.
     */
    post: operations['oauth-clients.discover']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/oauth/issuers/{id}/clients': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * Register a service account
     * @description Binds a subject from this issuer to a tenant and a scope set. Deleting the row later cuts off a still-valid token immediately, which is what registry authority buys over reading scopes from the token.
     */
    post: operations['oauth-clients.createClient']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/oauth/clients/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post?: never
    /**
     * Revoke a service account
     * @description Takes effect on the next request, mid-token: the client row is consulted on every call, so a revoked account stops working before its token expires.
     */
    delete: operations['oauth-clients.revokeClient']
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/oauth/issuers/{id}/rules': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * Add a scope-mapping rule
     * @description With no rules the token's scope claim passes through verbatim. Once any rule exists, only mapped values survive — an unmapped one is dropped rather than passed through raw.
     */
    post: operations['oauth-clients.createScopeRule']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/oauth/rules/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post?: never
    /** Delete a scope-mapping rule */
    delete: operations['oauth-clients.deleteScopeRule']
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/end-user-tokens': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List per-end-user MCP tokens
     * @description List MCP tokens scoped to individual end-users, optionally filtered by `endUserId` or `tenantId`. Operator role or higher. Returns token metadata only; plaintext secrets are never included.
     */
    get: operations['end-user-tokens.list']
    put?: never
    /**
     * Mint a per-end-user MCP token
     * @description Mint an MCP token scoped to a single end-user. Operator role or higher. The response includes the plaintext token **once** — it cannot be retrieved again. Returns `400` if `endUserId` or `tenantId` is missing. Writes an `end_user_token.mint` audit entry.
     */
    post: operations['end-user-tokens.create']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/end-user-tokens/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post?: never
    /**
     * Revoke a per-end-user MCP token
     * @description Revoke a per-end-user MCP token by id, effective immediately. Operator role or higher. Returns `404` if no token matches the id. Writes an `end_user_token.revoke` audit entry.
     */
    delete: operations['end-user-tokens.delete']
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/webhook-subscriptions': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List tenant webhook subscriptions
     * @description List webhook subscriptions (outbound delivery targets for `customer.*` and `connect_link.*` events), optionally filtered by `tenantId` and by a `search` over the label and URL. Operator role or higher. Signing secrets are not included.
     */
    get: operations['webhook-subs.list']
    put?: never
    /**
     * Create a webhook subscription (secret returned once)
     * @description Create a webhook subscription that delivers events to the given URL. Admin role required. The response includes the signing secret **once** — it is not stored in retrievable form and cannot be fetched again. Returns `400` if `tenantId` or `url` is missing. Writes a `webhook_sub.create` audit entry.
     */
    post: operations['webhook-subs.create']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/webhook-subscriptions/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post?: never
    /**
     * Delete a webhook subscription
     * @description Delete a webhook subscription by id, stopping further deliveries immediately. Admin role required. Returns `404` if no subscription matches the id. Writes a `webhook_sub.delete` audit entry.
     */
    delete: operations['webhook-subs.delete']
    options?: never
    head?: never
    /**
     * Change a webhook subscription label, payload format or headers
     * @description Change the label, and how deliveries are shaped and authenticated for this subscription. The URL and event list are immutable — recreate the subscription to change those. Headers are replaced wholesale rather than merged, so an operator can remove one; an empty object clears them. Header values are stored encrypted and never returned. Admin role required. Writes a `webhook_sub.update` audit entry.
     */
    patch: operations['webhook-subs.update']
    trace?: never
  }
  '/api/webhook-subscriptions/{id}/paused': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * Pause or resume a webhook subscription
     * @description Pause (default) or resume a subscription. A paused subscription is retained but receives no deliveries. Admin role required. Writes a `webhook_sub.pause` audit entry.
     */
    post: operations['webhook-subs.pause']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/webhook-subscriptions/{id}/test': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * Send a test event to a webhook subscription
     * @description Sends one synthetic `opensteward.test` event to this subscription, rendered in its own format, signed with its own secret and carrying its custom headers — so a destination can be proven to work without creating real data to trigger a real event. Nothing is queued and no delivery row is written. A receiver that rejects the payload is reported as `ok: false` with its status code rather than as an error. Works on a paused subscription. Admin role required. Writes a `webhook_sub.test` audit entry.
     */
    post: operations['webhook-subs.test']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/webhook-subscriptions/{id}/rotate-secret': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * Rotate a webhook subscription signing secret
     * @description Generate a NEW signing secret, replacing the old one. The plaintext is returned **once**. Admin role required. Writes a `webhook_sub.rotate_secret` audit entry.
     */
    post: operations['webhook-subs.rotate-secret']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/webhook-subscriptions/{id}/deliveries': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List deliveries for one subscription
     * @description List recent delivery attempts for one subscription, optionally filtered by `status` (`pending`, `delivered`, `dead`), `eventType`, `eventId`, and ordered by `sort`/`dir`, capped by `limit`. Operator role or higher. Filters and sort apply before pagination, so `meta.total` reflects the filtered set and every page reflects the requested order. Useful for diagnosing failed or dead-lettered deliveries.
     */
    get: operations['webhook-subs.deliveries.list']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/webhook-subscriptions/{id}/deliveries/{deliveryId}/replay': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * Replay a single webhook delivery
     * @description Re-enqueue a single past delivery for redelivery, e.g. after the receiver was down. Admin role required. Responds `202 Accepted` with the queued delivery, or `404` if the subscription or delivery is not found. Writes a `webhook_delivery.replay` audit entry.
     */
    post: operations['webhook-subs.deliveries.replay']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/sync-jobs': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List sync jobs
     * @description List data-sync jobs, optionally filtered by `vertical`, `connection_id`, `status`, `platform`, `tenant_id`, `id` and `connection_id_contains`, ordered by `sort`/`dir`, and paged with `page`/`limit`. `meta.total` is the number of rows matching the filter across the whole deployment — a real count, so a caller can page through every one of them. A tenant-restricted caller sees only jobs for its granted tenants. Any authenticated operator.
     */
    get: operations['sync-jobs.list']
    put?: never
    /**
     * Enqueue a one-off sync job
     * @description Enqueue a one-off data-sync job for a connection, with an optional completion `callback_url`. Operator role or higher. Responds `202 Accepted` with the queued job. Upstream refusals keep their own status: `409` when a sync is already running for the connection, `404` when the connection is unknown or the deployment runs in `passthrough` mode (no sync engine), `502` when integration-server cannot be reached. `400` if `connection_id` is missing. Writes a `sync_job.create` audit entry.
     */
    post: operations['sync-jobs.create']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/sync-jobs/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Read one sync job
     * @description Read a single sync job by id, including its status and progress. Any authenticated operator. Returns `404` if the job does not exist.
     */
    get: operations['sync-jobs.get']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/sync-jobs/{id}/cancel': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * Cancel a running sync job
     * @description Request cancellation of an in-flight sync job. Operator role or higher. Returns `404` if the job does not exist or is not in a cancelable state. Writes a `sync_job.cancel` audit entry.
     */
    post: operations['sync-jobs.cancel']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/data-store/metrics': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Data-store metrics (resource counts, last sync timestamps, etc.)
     * @description Return aggregate data-store metrics (resource counts, last-sync timestamps, and similar) for dashboards. Any authenticated operator; deployment-wide, so a tenant-restricted caller gets `403 SCOPE_RESTRICTED`. Responds with `data: null` when integration-server is unreachable so the UI can show an offline banner rather than erroring.
     */
    get: operations['sync-jobs.metrics']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/scope-groups': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List scope groups
     * @description List named scope groups (reusable bundles of platform permissions), optionally filtered by `vertical` and/or `platform`. Any authenticated operator.
     */
    get: operations['scope-groups.list']
    put?: never
    /**
     * Create a scope group
     * @description Create a named scope group for a vertical/platform. Operator role or higher. Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant. Scopes may be supplied as an array or a delimited string and are normalised to a deduped array. Returns `400` if `vertical`, `platform`, `name`, or a non-empty scope set is missing, and `409` if a group with that name already exists for the platform. Writes a `scope_group.create` audit entry.
     */
    post: operations['scope-groups.create']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/scope-groups/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    /**
     * Update a scope group
     * @description Update a scope group's name and/or scopes; omitted fields are left unchanged. Operator role or higher. Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant. Returns `400` for a non-numeric id and `404` if the group does not exist. Writes a `scope_group.update` audit entry.
     */
    put: operations['scope-groups.update']
    post?: never
    /**
     * Delete a scope group
     * @description Delete a scope group by id. Operator role or higher. Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant. Returns `400` for a non-numeric id and `404` if the group does not exist. Writes a `scope_group.delete` audit entry.
     */
    delete: operations['scope-groups.delete']
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/connect-link-templates': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List Connect Link templates
     * @description List Connect Link templates (reusable presets that define what a generated link lets a customer connect), optionally filtered by `tenantId`. Any authenticated operator.
     */
    get: operations['connect-link-templates.list']
    put?: never
    /**
     * Create a Connect Link template
     * @description Create a Connect Link template defining the link mode, allowed verticals/platforms, scope group, expiry, and redirect for links generated from it. Operator role or higher. Returns `400` if `tenantId`/`name` is missing or `linkMode` is invalid, and `409` if a template with that name already exists for the tenant. Writes a `connect_link_template.create` audit entry.
     */
    post: operations['connect-link-templates.create']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/connect-link-templates/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Read one Connect Link template
     * @description Read a single Connect Link template by id. Any authenticated operator. Returns `400` for a non-numeric id and `404` if the template does not exist.
     */
    get: operations['connect-link-templates.get']
    /**
     * Update a Connect Link template
     * @description Update a Connect Link template; omitted fields are left unchanged. Operator role or higher. Returns `400` for a non-numeric id or invalid `linkMode`, and `404` if the template does not exist. Writes a `connect_link_template.update` audit entry.
     */
    put: operations['connect-link-templates.update']
    post?: never
    /**
     * Delete a Connect Link template
     * @description Delete a Connect Link template by id. Operator role or higher. Returns `400` for a non-numeric id and `404` if the template does not exist. Writes a `connect_link_template.delete` audit entry.
     */
    delete: operations['connect-link-templates.delete']
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/tenant-domains/public': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** Public domain→tenant map (no auth) */
    get: operations['tenant-domains.get-public']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/tenants': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** List tenants */
    get: operations['tenants.list']
    put?: never
    /**
     * Create a tenant
     * @description Register a tenant. Operator role. 403 `SCOPE_RESTRICTED` for a tenant-restricted caller; 403 `LICENSE_LIMIT_EXCEEDED` (with `limitKey: 'tenants'`, `limit` and `used`) when the license's tenant limit, which counts `default`, is reached; 409 when the id already exists. Existing tenants are never removed.
     */
    post: operations['tenants.create']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/tenants/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    /** Rename a tenant */
    put: operations['tenants.update']
    post?: never
    /** Delete a tenant (not the default; must have no domains) */
    delete: operations['tenants.delete']
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/tenant-domains': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** List all custom domains */
    get: operations['tenant-domains.list']
    put?: never
    /** Attach a custom domain to a tenant */
    post: operations['tenant-domains.create']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/tenant-domains/{domain}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post?: never
    /** Detach a custom domain */
    delete: operations['tenant-domains.delete']
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/dashboard-tasks/dismissals': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List cleared dashboard tasks
     * @description Every dashboard task that has been cleared, with the fingerprint it was cleared at. The dashboard hides a task only when both the key and the fingerprint match. Any authenticated operator. A tenant-restricted user sees only the keys whose connection or sync job is inside their scope.
     */
    get: operations['dashboard-tasks.list-dismissals']
    put?: never
    /**
     * Clear dashboard tasks
     * @description Clear 1..50 dashboard tasks deployment-wide. Also acknowledges the matching unacknowledged notifications (`credential_expired` for `conn:expired:*`, `platform_credentials_invalid` for `platform:creds:*`), and the health poller will not re-raise them while the fingerprint is unchanged. Operator role or higher; Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant. `platform:creds:*` and `wizard:*` keys need the admin role, and one such key in the batch makes the whole request `403` with nothing stored. Writes a `dashboard_task.dismiss` audit entry.
     */
    post: operations['dashboard-tasks.dismiss']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/dashboard-tasks/dismissals/{key}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post?: never
    /**
     * Un-clear a dashboard task
     * @description Remove one clear so the task shows on the dashboard again (the Undo behind a clear). Operator role or higher; Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant. `platform:creds:*` and `wizard:*` keys need the admin role (`403` otherwise). Returns `404` when the key was not cleared. Writes a `dashboard_task.undismiss` audit entry.
     */
    delete: operations['dashboard-tasks.undismiss']
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/runtime-settings': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List runtime settings
     * @description List all runtime settings (tunables that can change without a redeploy) with their current values. Any authenticated operator may read — so the setup wizard can show the active mode — but only admins may change them.
     */
    get: operations['runtime-settings.list']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/runtime-settings/{key}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post?: never
    /**
     * Reset a runtime setting to its seeded default
     * @description Reset a runtime setting back to its seeded default value. Admin role required. Returns `404` if the key is unknown. Writes a `runtime_setting.reset` audit entry and invalidates the downstream settings cache.
     */
    delete: operations['runtime-settings.reset']
    options?: never
    head?: never
    /**
     * Update a runtime setting value
     * @description Update one runtime setting; the value type is validated against the seeded key. Admin role required. Returns `400` if the body `key` does not match the path key or the value fails validation, and `409` (break-glass) if disabling local login would leave no password-usable local admin. Takes effect promptly via cache invalidation and writes a `runtime_setting.update` audit entry.
     */
    patch: operations['runtime-settings.update']
    trace?: never
  }
  '/api/logo-fetch': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List logo-fetch jobs
     * @description Recent logo-fetch jobs, newest first. Any authenticated operator may watch a running fetch.
     */
    get: operations['logo-fetch.list']
    put?: never
    /**
     * Start a platform logo fetch
     * @description Queue a background job that downloads platform logos from Brandfetch and stores them in the admin database. Returns 202 with the queued job. A full catalog run takes tens of minutes; poll the job for progress. Only one fetch may run at a time.
     */
    post: operations['logo-fetch.start']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/logo-fetch/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Get a logo-fetch job
     * @description Fetch one logo-fetch job, including its per-vertical progress counters.
     */
    get: operations['logo-fetch.get']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/logo-fetch/{id}/cancel': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * Cancel a logo-fetch job
     * @description Ask a logo-fetch job to stop. A queued job is cancelled immediately (200). A running job moves to `cancelling` and stops at its next checkpoint (202) — cancellation is cooperative because the request usually lands on a different replica than the one running the job. Logos already fetched are kept.
     */
    post: operations['logo-fetch.cancel']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/logos/status': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Stored logo statistics
     * @description How many platform logos this deployment has stored, their total size, and when the newest was fetched.
     */
    get: operations['logos.status']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/logos': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post?: never
    /**
     * Delete every stored logo
     * @description Remove all stored platform logos. The catalog falls back to monogram tiles immediately. Provided because storing logos is caching under Brandfetch’s terms, so an operator needs a way to undo it.
     */
    delete: operations['logos.purge']
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/identity-providers': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List configured identity providers
     * @description List the configured SSO identity providers (SAML/OIDC) and their enabled state. Admin role required. Secrets are not returned.
     */
    get: operations['identity-providers.list']
    put?: never
    /**
     * Create an identity provider
     * @description Register a new SSO identity provider with its protocol-specific config. Admin role required. Returns `400` if the body or protocol config is invalid, and `409` if the slug is already taken. Writes an `sso.provider.create` audit entry.
     */
    post: operations['identity-providers.create']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/identity-providers/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Read one identity provider
     * @description Read a single identity provider's configuration by id (secrets redacted). Admin role required. Returns `404` if no provider matches the id.
     */
    get: operations['identity-providers.get']
    /**
     * Update an identity provider
     * @description Update an identity provider's settings, config, or secret; omitted fields are left unchanged. Admin role required. Returns `404` if the provider is missing, `400` if the protocol config is invalid, and `409` if changing the slug collides with another provider — or if the stored secret bundle cannot be decrypted with the current STORE_SECRET, in which case nothing is written, because merging into an unreadable bundle would discard every secret not resent. Recover by restoring the previous STORE_SECRET (or running rotate-store-secret); or resend every secret with `replaceUnreadableSecret` to replace the bundle outright. Writes an `sso.provider.update` audit entry.
     */
    put: operations['identity-providers.update']
    post?: never
    /**
     * Delete an identity provider
     * @description Delete an identity provider, disabling SSO logins through it. Admin role required. Returns `404` if no provider matches the id. Writes an `sso.provider.delete` audit entry.
     */
    delete: operations['identity-providers.delete']
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/identity-providers/{id}/metadata': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * SAML SP metadata XML (admin-only)
     * @description Return this service's SAML service-provider metadata as `application/xml`, to hand to the IdP during setup (advertises the ACS URL and, when configured, the SP signing certificate). Admin role required. Returns `404` if the provider does not exist or is not a SAML provider.
     */
    get: operations['identity-providers.metadata']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/identity-providers/{id}/role-mappings': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List a provider's role-mapping rules
     * @description List the role-mapping rules for one provider — the rules that translate IdP claims/groups into local roles on SSO login. Admin role required. Returns `404` if the provider does not exist.
     */
    get: operations['identity-providers.role-mappings.list']
    put?: never
    /**
     * Create a role-mapping rule
     * @description Add a role-mapping rule to a provider, mapping an IdP claim/group to a local role — a built-in `role`, or any role (built-in or custom) by `roleId`. Admin role required. Returns `404` if the provider does not exist, `400` if the rule body is invalid or `roleId` is unknown, and `403` if the role grants a permission or base role you do not hold. Writes an `sso.role_mapping.create` audit entry.
     */
    post: operations['identity-providers.role-mappings.create']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/identity-providers/{id}/role-mappings/{ruleId}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post?: never
    /**
     * Delete a role-mapping rule
     * @description Delete a single role-mapping rule from a provider. Admin role required. Returns `404` if the rule (or provider) does not exist. Writes an `sso.role_mapping.delete` audit entry.
     */
    delete: operations['identity-providers.role-mappings.delete']
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/identity-providers/{id}/scope-rules': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List a provider's scope-mapping rules
     * @description List the scope-mapping rules for one provider — the rules that grant tenant scope from IdP claims/groups on SSO login. Every matching rule applies (the tenants are unioned); when none match, the provider default scope applies. Admin role and `users:manage` required. Returns `404` if the provider does not exist.
     */
    get: operations['identity-providers.scope-rules.list']
    put?: never
    /**
     * Create a scope-mapping rule
     * @description Add a scope-mapping rule: users whose claim matches may see the listed tenants (`["*"]` = every tenant), optionally only some verticals. Applied on each SSO login and SCIM group change to users whose scope is IdP-owned (`scopeSource: idp`, the default for JIT and SCIM users). Admin role and `users:manage` required. Returns `404` if the provider does not exist, `400` for an invalid body or unknown tenant, and `403` when the rule grants tenants outside your own scope. Writes an `idp.scope_rule.create` audit entry.
     */
    post: operations['identity-providers.scope-rules.create']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/identity-providers/{id}/scope-rules/{ruleId}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post?: never
    /**
     * Delete a scope-mapping rule
     * @description Delete a single scope-mapping rule from a provider. Takes effect for each affected user at their next SSO login. Admin role and `users:manage` required. Returns `404` if the rule (or provider) does not exist. Writes an `idp.scope_rule.delete` audit entry.
     */
    delete: operations['identity-providers.scope-rules.delete']
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/identity-providers/{id}/default-scope': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    /**
     * Set a provider's default tenant scope
     * @description Set the scope SSO users of this provider get when no scope rule matches: `all` tenants (the default, and what every provider had before scope rules existed) or `restricted` to `tenantIds` (empty = no tenants). Admin role and `users:manage` required. Returns `404` if the provider does not exist, `400` for an unknown tenant, and `403` when the scope reaches beyond your own. Writes an `idp.default_scope.update` audit entry.
     */
    patch: operations['identity-providers.default-scope.update']
    trace?: never
  }
  '/api/identity-providers/{id}/scim-tokens': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List SCIM bearer tokens for a provider
     * @description List the SCIM bearer tokens issued for a provider (used by the IdP to provision/deprovision users via SCIM). Admin role required. Plaintext token values are not returned. Returns `404` if the provider does not exist.
     */
    get: operations['identity-providers.scim-tokens.list']
    put?: never
    /**
     * Mint a SCIM bearer token (plaintext returned once)
     * @description Mint a new SCIM bearer token for a provider. Admin role required. The response includes the plaintext token **once** — it cannot be retrieved again. Returns `404` if the provider does not exist. Writes an `sso.scim_token.mint` audit entry.
     */
    post: operations['identity-providers.scim-tokens.create']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/identity-providers/{id}/scim-tokens/{tokenId}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post?: never
    /**
     * Revoke a SCIM bearer token
     * @description Revoke a SCIM bearer token by id, effective immediately. Admin role required. Returns `404` if no token matches the id. Writes an `sso.scim_token.revoke` audit entry.
     */
    delete: operations['identity-providers.scim-tokens.delete']
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/sso/login-options': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Public list of enabled SSO providers + local-login flag
     * @description Public, **unauthenticated** endpoint that returns the enabled SSO providers (no secrets) and whether the local password form should be shown. Consumed by the login page to render its sign-in options.
     */
    get: operations['sso.login-options']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/sso/{slug}/login': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Begin an OIDC / SAML login redirect
     * @description Begin an SSO login by redirecting (`302`) to the OIDC or SAML provider identified by `slug`; an optional `return_to` is preserved through the round-trip. Unauthenticated and rate-limited (10/min). Returns `404` if the provider is unknown or disabled, `400` if it does not support redirect login (e.g. LDAP), and `502` if initiation fails.
     */
    get: operations['sso.login']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/sso/{slug}/callback': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * OIDC redirect-callback endpoint
     * @description OIDC redirect-callback the provider sends the browser back to after authentication. Unauthenticated and rate-limited (10/min). Validates the `state`, provisions/maps the user, then `302`-redirects to the UI completion route with a one-time handoff code. Returns `400` for missing/invalid/expired state, `404` for an unknown provider, and `401` if authentication fails. Writes an `sso.login` audit entry.
     */
    get: operations['sso.callback']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/sso/{slug}/acs': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * SAML Assertion Consumer Service (form-POST)
     * @description SAML Assertion Consumer Service: the form-encoded `SAMLResponse` the IdP POSTs after authentication. Unauthenticated and rate-limited (10/min). Validates the assertion, provisions/maps the user, then `302`-redirects to the UI completion route with a one-time handoff code. Returns `400` if `SAMLResponse` is missing, `404` for a non-SAML/unknown provider, `500` if the IdP certificate is unconfigured, and `401` on validation failure. Writes an `sso.login` audit entry.
     */
    post: operations['sso.acs']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/sso/{slug}/ldap-login': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * LDAP direct username/password login → JWT
     * @description Authenticate a username/password directly against an LDAP provider and return a JWT (no browser redirect). Unauthenticated and tightly rate-limited (5/min). Returns `400` if a credential is missing, `404` for an unknown/disabled/non-LDAP provider, `401` on invalid credentials, and `403` if JIT provisioning is disabled for a first-time user. Writes an `sso.login` audit entry.
     */
    post: operations['sso.ldap-login']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/sso/handoff/exchange': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * Exchange a one-time SSO handoff code for a JWT
     * @description Exchange the one-time handoff code issued at the end of an OIDC/SAML flow for a JWT. Called server-to-server by the admin UI; unauthenticated and rate-limited (30/min). The code is single-use — returns `400` if it is missing, already consumed, or expired.
     */
    post: operations['sso.handoff.exchange']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/scim/v2/ServiceProviderConfig': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * SCIM 2.0 ServiceProviderConfig discovery doc
     * @description SCIM 2.0 `ServiceProviderConfig` discovery document advertising the supported features. Authenticated by a per-provider SCIM bearer token (not the admin JWT); returns `401` if the token is missing or invalid. Called by IdPs during SCIM setup.
     */
    get: operations['scim.service-provider-config']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/scim/v2/Users': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * SCIM 2.0 Users list
     * @description List SCIM Users provisioned through the calling provider, supporting `filter` (e.g. `userName eq`) and `startIndex`/`count` pagination per RFC 7644. Authenticated by the per-provider SCIM bearer token (`401` if invalid). Driven by the IdP, not the admin UI.
     */
    get: operations['scim.users.list']
    put?: never
    /**
     * SCIM 2.0 User create (provision)
     * @description Provision a new admin user from a SCIM User resource, creating the local account and identity link. Authenticated by the per-provider SCIM bearer token (`401` if invalid). The user's role is derived from group membership via the provider's role-mapping rules. Writes a SCIM provisioning audit entry.
     */
    post: operations['scim.users.create']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/scim/v2/Users/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * SCIM 2.0 User read
     * @description Read one SCIM User by id. Authenticated by the per-provider SCIM bearer token (`401` if invalid). Returns `404` if the user is not provisioned through this provider.
     */
    get: operations['scim.users.get']
    /**
     * SCIM 2.0 User replace
     * @description Replace a SCIM User resource (PUT). Authenticated by the per-provider SCIM bearer token (`401` if invalid). Returns `404` if the user is not provisioned through this provider. Setting `active: false` deprovisions the user, subject to the break-glass guard.
     */
    put: operations['scim.users.replace']
    post?: never
    /**
     * SCIM 2.0 User delete (deprovision)
     * @description Deprovision (delete) a SCIM User, removing the local account and its identity links. Authenticated by the per-provider SCIM bearer token (`401` if invalid). Returns `409` if deletion would leave no break-glass admin. Writes an `sso.scim.deprovision` audit entry.
     */
    delete: operations['scim.users.delete']
    options?: never
    head?: never
    /**
     * SCIM 2.0 User patch (PatchOp)
     * @description Apply a SCIM `PatchOp` to a User (e.g. toggle `active` to deactivate). Authenticated by the per-provider SCIM bearer token (`401` if invalid). Returns `404` if the user is unknown; deactivation deprovisions the account, subject to the break-glass guard.
     */
    patch: operations['scim.users.patch']
    trace?: never
  }
  '/scim/v2/Groups': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * SCIM 2.0 Groups list
     * @description List SCIM Groups for the calling provider, with optional `filter` support per RFC 7644. Authenticated by the per-provider SCIM bearer token (`401` if invalid). Group membership feeds the same role-mapping engine used at login.
     */
    get: operations['scim.groups.list']
    put?: never
    /**
     * SCIM 2.0 Group create
     * @description Create a SCIM Group for the calling provider. Authenticated by the per-provider SCIM bearer token (`401` if invalid). Membership changes recompute affected users' roles via the provider's role-mapping rules.
     */
    post: operations['scim.groups.create']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/scim/v2/Groups/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * SCIM 2.0 Group read
     * @description Read one SCIM Group by id, including its members. Authenticated by the per-provider SCIM bearer token (`401` if invalid). Returns `404` if the group does not exist for this provider.
     */
    get: operations['scim.groups.get']
    put?: never
    post?: never
    /**
     * SCIM 2.0 Group delete
     * @description Delete a SCIM Group. Authenticated by the per-provider SCIM bearer token (`401` if invalid). Returns `404` if the group does not exist; removing it recomputes the roles of its former members.
     */
    delete: operations['scim.groups.delete']
    options?: never
    head?: never
    /**
     * SCIM 2.0 Group patch
     * @description Apply a SCIM `PatchOp` to a Group, typically to add or remove members. Authenticated by the per-provider SCIM bearer token (`401` if invalid). Returns `404` if the group is unknown; membership changes recompute affected users' roles.
     */
    patch: operations['scim.groups.patch']
    trace?: never
  }
  '/api/schema-status': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Per-namespace _schema_migrations rows for every reachable SQLite db
     * @description Report the applied `_schema_migrations` rows for each SQLite database this admin-api can reach, grouped by namespace. Admin role required (diagnostic detail not exposed to operator/viewer). Developer diagnostics: migrations apply when each service starts and a failed one stops the boot, so a running service has applied its own. A missing db file is reported as an empty row set rather than an error.
     */
    get: operations['schema-status.list']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/license': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * The deployment's license status
     * @description The license as integration-server evaluates it (state, who it is issued to, expiry, enabled features, limits and usage), as admin-api last read it — cached for a minute, served with `stale: true` while integration-server is not answering. Never contains the license token. Admin role required. 503 `LICENSE_STATUS_UNAVAILABLE` until integration-server has answered once; its message names `ADMIN_SECRET` when that is why.
     */
    get: operations['license.get']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/data/summary': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Summarise stored data per connection
     * @description List every connection in your tenant scope with the resource types the data store holds for it: record counts, the newest change and when each type was last fully synced. Requires `data:read`. Answers `409` (`DATA_STORE_DISABLED`) when the deployment runs in passthrough mode.
     */
    get: operations['data.summary']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/data/schema/{vertical}/{type}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Describe a stored resource type
     * @description Fields of a stored resource type with their classification (`public`, `internal`, `pii`, `financial`, `secret`) and whether you may filter on them. Requires `data:read`. `404` for an unknown type or one outside your scope.
     */
    get: operations['data.schema']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/data/connections/{id}/resources/{type}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List stored records
     * @description One cursor-paginated page of stored records of a type on a connection, masked by field classification (personal data is never revealed here). Supports `filters`, free-text `q`, `sort` and `dir`. Requires `data:read`. `404` when the connection is unknown or outside your tenant scope; `400` `FIELD_NOT_SEARCHABLE` for a filter on a field you may not search; `409` in passthrough mode.
     */
    get: operations['data.records.list']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/data/connections/{id}/resources/{type}/export': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Export stored records as CSV or NDJSON
     * @description Stream every stored record of a type on a connection (up to 100,000) as a `csv` or `ndjson` attachment, masked like the list. `include_pii=true` exports personal data unmasked and additionally requires `data:read_pii`. Requires `data:export`. Every export is written to the audit log as `data.export`.
     */
    get: operations['data.records.export']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/data/connections/{id}/resources/{type}/{rid}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Read one stored record (masked)
     * @description One stored record with its row metadata, masked by field classification. To see personal data use the `reveal` route. Requires `data:read`. `404` when the connection, type or record is unknown or outside your scope.
     */
    get: operations['data.records.get']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/data/connections/{id}/resources/{type}/{rid}/reveal': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * Reveal the personal data in one stored record
     * @description The stored record with personal data unmasked (secrets are still removed; financial fields follow `data_access.mask_financial`). Requires `data:read` and `data:read_pii`. Every reveal is written to the audit log as `data.pii_reveal`, with the optional `reason`, before the record is returned. The response is `Cache-Control: no-store`.
     */
    post: operations['data.records.reveal']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/dashboards': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List dashboards
     * @description The built-in dashboards, then every dashboard shared with you (your own, those shared with a tenant in your access, those shared with everyone; an admin with access to every tenant sees all), most recently updated first. Requires `dashboards:view`.
     */
    get: operations['dashboards.list']
    put?: never
    /**
     * Create a dashboard
     * @description Create a dashboard from up to 24 widgets, each naming a catalog metric, a chart type and a width (1–12 columns). Shared per `audience` (default `private`); `everyone` needs `dashboards:share_all`, and a caller with restricted access may share with and pin only tenants in that access (`403`). Requires `dashboards:edit`. `400` for a metric not in your catalog, a chart that is not one of its metric's `charts` (`Chart <chart> does not fit <metric>`) or an unknown tenant. Writes `dashboard.create` and, when shared or pinned, `dashboard.share` audit entries.
     */
    post: operations['dashboards.create']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/dashboards/metrics': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List the metric catalog
     * @description Every metric a widget can chart in your scope: built-in system metrics and per-vertical metrics over stored records. Metrics never read personal-data fields. Requires `dashboards:view`.
     */
    get: operations['dashboards.metrics.list']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/dashboards/metrics/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Compute one metric
     * @description One metric over the connections in your tenant scope, for the days `from`..`to` (inclusive, `YYYY-MM-DD`; default the last 30 days, at most 366). Money is never combined across currencies: every money series, total and KPI carries its currency, and `currency` keeps only one. `granularity` sets the buckets of a series over time and `compare=1` adds `previous`, the prior equal-length range. Results are cached for 60 seconds per metric, scope and parameters. Requires `dashboards:view`. `404` for a metric outside your scope, `400` for a bad range or parameter, `409` in passthrough mode. Pass `dashboard` to apply that dashboard's pinned tenants (your scope ∩ its pins), and `connection` and/or `platform` to narrow further to one connection and/or one adapter (system metrics included), kept to `vertical` when given; a connection outside your scope yields no data, and the result echoes the filter as `filter`. `connection` and `platform` also need `connections:read` (`403` otherwise).
     */
    get: operations['dashboards.metrics.get']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/dashboards/currencies': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List currencies to filter by
     * @description The distinct currencies (ISO 4217, sorted) across the money and currency fields the metric catalog reads, over the connections in your tenant scope — the choices for a dashboard's currency filter and a widget's currency pin. Pass `dashboard` to narrow to that dashboard's pinned tenants (your scope ∩ its pins), and `connection` and/or `platform` (kept to `vertical` when given) to list only that connection's or adapter's currencies. Cached for 60 seconds per scope and filter. Requires `dashboards:view`, and `connections:read` too with `connection` or `platform` (`403` otherwise). `400` for a malformed `connection`, `platform` or `vertical`, `404` for a dashboard you cannot see, `409` in passthrough mode.
     */
    get: operations['dashboards.currencies.list']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/dashboards/connections': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List connections to filter a dashboard by
     * @description The connections in your tenant scope that a dashboard's connection filter can offer, with the adapters among them — narrowed to `vertical`, to a stored dashboard's pinned tenants when `dashboard` is given (your scope ∩ its pins), to one adapter with `platform`, and by `search`, a case-insensitive substring of the connection id or label (an id prefix is enough). `platforms` lists the adapters of the vertical's connections you can see, with counts, ignoring `search` and `platform`. Connections carry only an id, a label, an adapter and a vertical: never a tenant id, a status or a credential, and a connection outside your scope is absent even when searched for by its exact id. `limit` caps the list (default 50, at most 200; other values are clamped); `total` counts every match. Requires `dashboards:view` and `connections:read`. `400` for an unknown vertical or a malformed adapter, `404` for a dashboard you cannot see.
     */
    get: operations['dashboards.connections.list']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/dashboards/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Read one dashboard
     * @description A built-in dashboard, or one shared with you. Requires `dashboards:view`. `404` for an unknown id or a dashboard not shared with you.
     */
    get: operations['dashboards.get']
    put?: never
    post?: never
    /**
     * Delete a dashboard
     * @description Delete your own dashboard (admins may delete any). Requires `dashboards:edit`. `409` for a built-in, `403` for someone else’s, `404` when it does not exist. Writes a `dashboard.delete` audit entry.
     */
    delete: operations['dashboards.delete']
    options?: never
    head?: never
    /**
     * Edit a dashboard
     * @description Edit your own dashboard (admins may edit any); omitted fields are unchanged. Requires `dashboards:edit`. `409` for a built-in dashboard, `403` for someone else’s or a sharing change you may not make, `400` for an unknown tenant, a metric not in your catalog or a chart that does not fit its metric, `404` when it does not exist or is not visible to you. Writes a `dashboard.update` audit entry, and `dashboard.share` when the audience or pins change.
     */
    patch: operations['dashboards.update']
    trace?: never
  }
  '/api/analytics/superset/status': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Embedded Superset status
     * @description Whether embedded Apache Superset dashboards are configured, and the browser-facing Superset URL the admin UI embeds from. Requires `dashboards:view`.
     */
    get: operations['superset.status']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/analytics/superset/dashboards': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List embedded Superset dashboards
     * @description The registered Superset dashboards you may open: those whose extra permission you hold and whose verticals your tenant scope reaches. What each shows is still filtered to your tenants by the guest token. Requires `dashboards:view`. `409 SUPERSET_DISABLED` when Superset is not configured.
     */
    get: operations['superset.dashboards.list']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/analytics/superset/dashboards/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    /**
     * Choose who sees a Superset dashboard
     * @description Set a registered dashboard’s audience (`tenants` or `everyone`; not `private`) and optional pinned tenants, which narrow its guest-token row-level security to viewer scope ∩ pins. The bootstrap job never changes these. Requires `dashboards:share_all` and access to every tenant (`403 SCOPE_RESTRICTED` for a tenant-restricted caller, since registry entries are deployment-wide). `404` for a dashboard you cannot open, `409 SUPERSET_DISABLED` when Superset is not configured. Writes a `superset.share` audit entry.
     */
    patch: operations['superset.dashboards.update-sharing']
    trace?: never
  }
  '/api/analytics/superset/guest-token': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * Mint a Superset guest token
     * @description A guest token for one registered dashboard, valid for 5 minutes, carrying a row-level-security clause that limits every query to your tenant scope, narrowed to the dashboard’s pinned tenants when it has any (no clause only when you see every tenant and it is unpinned). Requires `dashboards:view` (and the dashboard’s extra permission, if any). `404` for a dashboard you may not open, `403 SCOPE_EMPTY` when your access is restricted to no tenants, `409 SUPERSET_DISABLED` when Superset is not configured, `502 SUPERSET_UNAVAILABLE` when Superset refuses or cannot be reached. Writes a `superset.guest_token` audit entry at most once per user and dashboard every 10 minutes.
     */
    post: operations['superset.guest-token.create']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/destinations/types': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List destination types
     * @description Every destination type with its settings form: the non-secret config and write-only secret fields as JSON Schema (types, defaults, descriptions). Types flagged `experimental` work but may still change; a type listed with `available: false` cannot be created. Requires `destinations:manage`.
     */
    get: operations['destinations.types']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/destinations': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List destinations
     * @description Destinations whose scope lies inside yours, with their last run. Requires `destinations:manage`. `409` `DATA_STORE_DISABLED` in passthrough mode.
     */
    get: operations['destinations.list']
    put?: never
    /**
     * Create a destination
     * @description Create a destination. `config` and `secrets` follow the type's schemas (`GET /api/destinations/types`); secrets are stored encrypted and never returned. `scope` must lie inside your own (`403` `SCOPE_EXCEEDS_CALLER`); `includePii` needs `data:read_pii` (`403` `PII_NOT_PERMITTED`) and records you as approver. Every host named must be public unless allow-listed (`400` `HOST_NOT_ALLOWED`). Requires `destinations:manage`; audited as `destination.create`.
     */
    post: operations['destinations.create']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/destinations/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Get a destination
     * @description One destination. `404` when unknown or outside your scope. Requires `destinations:manage`.
     */
    get: operations['destinations.get']
    put?: never
    post?: never
    /**
     * Delete a destination
     * @description Delete a destination with its cursors and run history. Files and rows already exported stay where they are. Requires `destinations:manage`; audited as `destination.delete`.
     */
    delete: operations['destinations.delete']
    options?: never
    head?: never
    /**
     * Change a destination
     * @description Change a destination’s name, config, scope, PII setting, interval or enabled state. Changing the config, scope or PII of a PII destination needs `data:read_pii`; turning it off or disabling it does not. Widening the scope does not re-export skipped rows: run a backfill. Requires `destinations:manage`; audited as `destination.update`.
     */
    patch: operations['destinations.update']
    trace?: never
  }
  '/api/destinations/{id}/credentials': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    /**
     * Replace (rotate) destination credentials
     * @description Replace every secret of a destination with the ones given (fields left out are cleared). Values are write-only: the response lists only the names set, and the audit row (`destination.credentials_rotate`) records names only. On a PII destination this needs `data:read_pii`. Requires `destinations:manage`.
     */
    put: operations['destinations.credentials']
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/destinations/{id}/test': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * Test a destination connection
     * @description Build the sink with the stored credentials and prove it can write: a probe object in the bucket, or `CREATE` on the Postgres schema. A failed test still answers `200` with `ok: false` and the reason. Requires `destinations:manage`; audited as `destination.test`.
     */
    post: operations['destinations.test']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/destinations/{id}/run': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * Run a destination now
     * @description Start an export run now, outside the schedule. `202` with the run id; `409` `RUN_IN_PROGRESS` when one is already running, `409` `DESTINATION_DISABLED` when it is disabled. Requires `destinations:manage`; audited as `destination.run`.
     */
    post: operations['destinations.run']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/destinations/{id}/backfill': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * Backfill a destination
     * @description Reset the export cursors — all of them, one vertical’s, or one resource type’s — so the next run re-exports every stored record in scope, then start a run unless `run: false`. Consumers should deduplicate on `_pk`. Requires `destinations:manage`; audited as `destination.backfill`.
     */
    post: operations['destinations.backfill']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/destinations/{id}/runs': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List destination runs
     * @description Run history of a destination, newest first: trigger, status, rows and deletions written, files, and the error of a failed run. Requires `destinations:manage`.
     */
    get: operations['destinations.runs']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/sql-access/status': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Read-only SQL access status
     * @description Backend, provisioning mode, deployed catalog version, advertised read host and warnings. Answers on SQLite too (`backend: sqlite`), where SQL access is unavailable. Requires `sql_access:manage`.
     */
    get: operations['sqlAccess.status']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/sql-access/provision': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * Provision the SQL views
     * @description Create or update the roles, schemas and views now (managed mode only; `409` `MANUAL_MODE` otherwise — use the provisioning script). Deployment-wide, so it needs an all-tenant scope (`403` `SCOPE_TOO_NARROW`). `409` `POSTGRES_REQUIRED` on SQLite. Requires `sql_access:manage`; audited as `sql_access.provision`.
     */
    post: operations['sqlAccess.provision']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/sql-access/provision-script': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Download the provisioning script
     * @description The provisioning SQL as `text/plain` (one `BEGIN … COMMIT` transaction), for manual mode: run it as a role with CREATEROLE. Needs an all-tenant scope. `409` `POSTGRES_REQUIRED` on SQLite. Requires `sql_access:manage`.
     */
    get: operations['sqlAccess.provisionScript']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/sql-access/catalog': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List the SQL views and columns
     * @description Every view a SQL login can read, with each column’s type in the masked and unmasked schemas and its classification. Requires `data:read`. `409` `POSTGRES_REQUIRED` on SQLite.
     */
    get: operations['sqlAccess.catalog']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/sql-access/principals': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * List SQL principals
     * @description SQL logins inside your scope (unmasked ones only for `data:read_pii` holders), including revoked and expired ones. Requires `sql_access:manage`. `409` `POSTGRES_REQUIRED` on SQLite.
     */
    get: operations['sqlAccess.principals.list']
    put?: never
    /**
     * Create a SQL principal
     * @description Create a read-only Postgres login. The response carries its password ONCE (`Cache-Control: no-store`); it is never stored or logged — rotate it if lost. The scope must lie inside yours (`403` `SCOPE_EXCEEDS_CALLER`); `pii: true` needs `data:read_pii` (`403` `PII_NOT_ALLOWED`). `409` `NOT_PROVISIONED` before the views exist, `409` `POSTGRES_REQUIRED` on SQLite. Requires `sql_access:manage`; audited as `sql_access.principal_create` (without the password).
     */
    post: operations['sqlAccess.principals.create']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/sql-access/principals/{id}/rotate': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * Rotate a SQL principal's password
     * @description Generate a new password, returned ONCE (`Cache-Control: no-store`). The old one stops working immediately and open sessions are ended. `404` for a principal unknown or outside your scope. Requires `sql_access:manage`; audited as `sql_access.principal_rotate` (without the password).
     */
    post: operations['sqlAccess.principals.rotate']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/sql-access/principals/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post?: never
    /**
     * Revoke a SQL principal
     * @description Revoke a login: it can no longer sign in, loses its grants and scope, and its open sessions are ended. The record stays, marked `revoked`. Requires `sql_access:manage`; audited as `sql_access.principal_revoke`.
     */
    delete: operations['sqlAccess.principals.revoke']
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
}
export type webhooks = Record<string, never>
export interface components {
  schemas: {
    /** @description Credentials for local username/password login. */
    LoginBody: {
      /**
       * @description Login name of the admin user.
       * @example olivia.admin
       */
      username: string
      /**
       * @description The user's password.
       * @example s3cr3t-password
       */
      password: string
    }
    /** @description Credentials to bootstrap the first admin account on a fresh deployment. */
    SetupBody: {
      /**
       * @description Login name for the first admin user to create during initial setup.
       * @example olivia.admin
       */
      username: string
      /**
       * @description Password for the first admin user.
       * @example s3cr3t-password
       */
      password: string
    }
    /** @description Request body to create an admin-console user. */
    CreateUserBody: {
      /**
       * @description Login name for the new admin user; unique within the deployment.
       * @example olivia.admin
       */
      username: string
      /**
       * @description Initial password for the new user.
       * @example s3cr3t-password
       */
      password: string
      /**
       * @description Access level to grant: `admin`, `operator`, or `viewer`.
       * @example admin
       */
      role: components['schemas']['Role']
      /**
       * @description Optional email address. Set here it is owned by the console (`emailSource: manual`) and SSO never overwrites it.
       * @example olivia@northwind.example
       */
      email?: string | null
    }
    /** @enum {string} */
    Role: 'admin' | 'operator' | 'viewer'
    /** @description Request body to update a console account. */
    UpdateUserBody: {
      /**
       * @description New role for the account.
       * @example operator
       */
      role?: components['schemas']['Role']
      /**
       * @description New password for the account (policy-checked).
       * @example fresh-s3cr3t-password
       */
      password?: string
      /**
       * @description New email address, or `null` to clear it. An address set here is owned by the console (`emailSource: manual`): SSO sign-ins and SCIM no longer overwrite it. Clearing it hands ownership back, so the next SSO sign-in may fill it from the identity provider.
       * @example olivia@northwind.example
       */
      email?: string | null
    }
    /** @description A profile picture to store for a console user. */
    PutUserAvatarBody: {
      /**
       * @description The picture as base64, or as a `data:` URL. PNG, JPEG or WebP, at most 512 KB decoded. The type is read from the bytes; whatever a data URL declares is ignored, and SVG is refused.
       * @example data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==
       */
      data: string
    }
    /** @description Request body to create a custom role. */
    CreateRoleBody: {
      /**
       * @description Display name; unique, case-insensitively.
       * @example Support lead
       */
      name: string
      /**
       * @description What the role is for.
       * @example Reads data for the accounts they support.
       */
      description?: string | null
      /**
       * @description Built-in level a holder is treated as by role-gated routes. Cannot exceed your own.
       * @example operator
       */
      baseRole: components['schemas']['Role']
      /**
       * @description Permissions the role grants. Each must be one you hold yourself.
       * @example [
       *       "connections:read",
       *       "data:read"
       *     ]
       */
      permissions: components['schemas']['Permission'][]
    }
    /**
     * @description A fine-grained operator permission. See `GET /api/permissions` for the catalog.
     * @example data:read
     * @enum {string}
     */
    Permission:
      | 'connections:read'
      | 'connections:manage'
      | 'data:read'
      | 'data:read_pii'
      | 'data:export'
      | 'dashboards:view'
      | 'dashboards:edit'
      | 'dashboards:share_all'
      | 'destinations:manage'
      | 'sql_access:manage'
      | 'roles:manage'
      | 'users:manage'
      | 'settings:manage'
    /** @description Request body to edit a custom role; omitted fields are unchanged. */
    UpdateRoleBody: {
      /**
       * @description Display name; unique, case-insensitively.
       * @example Support lead
       */
      name?: string
      /**
       * @description What the role is for; `null` clears it.
       * @example Reads data for the accounts they support.
       */
      description?: string | null
      /**
       * @description New base role. Propagated to every holder.
       * @example operator
       */
      baseRole?: components['schemas']['Role']
      /**
       * @description Replacement permission set.
       * @example [
       *       "connections:read",
       *       "data:read",
       *       "data:export"
       *     ]
       */
      permissions?: components['schemas']['Permission'][]
    }
    /** @description Request body to assign a role to a console user. */
    AssignUserRoleBody: {
      /**
       * @description Role to assign: `admin`, `operator`, `viewer`, or a custom role id.
       * @example operator
       */
      roleId: string
    }
    /** @description Request body to set a console user's tenant scope. */
    SetUserScopeBody: {
      /**
       * @description `all` for every tenant, or `restricted` to `grants`.
       * @example restricted
       */
      mode: components['schemas']['ScopeMode']
      /**
       * @description Tenants (and optionally verticals) granted when `mode` is `restricted`.
       * @example [
       *       {
       *         "tenantId": "acme",
       *         "verticals": "*"
       *       }
       *     ]
       */
      grants?: components['schemas']['ScopeGrant'][]
      /**
       * @description `manual` (default) pins this scope; `idp` hands the user back to IdP scope rules, which overwrite it on the next SSO login.
       * @example manual
       * @enum {string}
       */
      source?: 'manual' | 'idp'
    }
    /**
     * @description `all` sees every tenant; `restricted` only the granted ones.
     * @example all
     * @enum {string}
     */
    ScopeMode: 'all' | 'restricted'
    /** @description Tenant (and optionally verticals) a scoped user may see. */
    ScopeGrant: {
      /**
       * @description Tenant the grant covers.
       * @example acme
       */
      tenantId: string
      /**
       * @description Verticals within the tenant: `*` for every vertical, or a list.
       * @example *
       */
      verticals: '*' | string[]
    }
    /**
     * @description One of the nine verticals OpenSteward maps to a canonical API.
     * @example accounting
     * @enum {string}
     */
    Vertical:
      | 'accounting'
      | 'crm'
      | 'ecommerce'
      | 'logistics'
      | 'payments'
      | 'docsign'
      | 'projects'
      | 'customer-support'
      | 'inventory'
    /** @description How often a connection's data is re-synced. `default` follows the deployment interval (runtime setting `data_store.sync.default_interval_minutes`); `custom` uses `intervalMinutes` (15–43200); `trigger_only` never syncs automatically, not even when connected; `once` syncs once when connected. */
    ConnectionSyncSchedule: {
      /**
       * @description `default` (the deployment interval), `custom` (every `intervalMinutes`), `trigger_only` (only when a sync is requested) or `once` (one sync when connected).
       * @example custom
       * @enum {string}
       */
      mode: 'default' | 'custom' | 'trigger_only' | 'once'
      /**
       * @description Minutes between syncs, 15–43200 (30 days). Required for `custom`; refused with any other mode.
       * @example 120
       */
      intervalMinutes?: number
    }
    /** @description Request body to enable a platform for a vertical, optionally supplying its config. */
    PlatformEnableBody: {
      /** @description Operator credentials/config to apply when enabling the platform; omit to enable without configuring. */
      config?: components['schemas']['PlatformConfig']
    }
    /** @description Operator-supplied platform configuration, keyed by `authType`. */
    PlatformConfig:
      | components['schemas']['PlatformConfigOauth2']
      | components['schemas']['PlatformConfigOauth2Cc']
      | components['schemas']['PlatformConfigApiKey']
      | components['schemas']['PlatformConfigBasic']
      | components['schemas']['PlatformConfigSession']
    PlatformConfigOauth2: {
      /**
       * @description Discriminator selecting the standard authorization-code OAuth2 flow. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      authType: 'oauth2'
      /**
       * @description OAuth client ID issued by the platform.
       * @example opensteward
       */
      clientId: string
      /**
       * @description OAuth client secret; write-only and never returned in responses.
       * @example s3cr3t-client-value
       */
      clientSecret: string
      /**
       * Format: uri
       * @description Redirect/callback URI registered with the platform; defaults to the deployment callback if omitted.
       * @example https://app.acme.example/return
       */
      redirectUri?: string
      /**
       * @description OAuth scopes to request; defaults to the adapter recommendation if omitted.
       * @example [
       *       "accounting.transactions.read"
       *     ]
       */
      scopes?: string[]
    }
    PlatformConfigOauth2Cc: {
      /**
       * @description Discriminator selecting the OAuth2 client-credentials (machine-to-machine) flow. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      authType: 'oauth2_cc'
      /**
       * @description OAuth client ID issued by the platform.
       * @example opensteward
       */
      clientId: string
      /**
       * @description OAuth client secret; write-only and never returned in responses.
       * @example s3cr3t-client-value
       */
      clientSecret: string
      /**
       * Format: uri
       * @description Token endpoint to exchange client credentials for an access token.
       * @example https://idp.northwind.example/oauth/token
       */
      tokenUrl: string
      /**
       * @description OAuth scopes to request; defaults to the adapter recommendation if omitted.
       * @example [
       *       "accounting.transactions.read"
       *     ]
       */
      scopes?: string[]
    }
    PlatformConfigApiKey: {
      /**
       * @description Discriminator selecting static API-key authentication. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      authType: 'api_key'
      /**
       * @description API key used to authenticate to the platform; write-only and never returned.
       * @example osk_acme_8f3a
       */
      apiKey: string
    }
    PlatformConfigBasic: {
      /**
       * @description Discriminator selecting HTTP Basic authentication. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      authType: 'basic'
      /**
       * @description Username for HTTP Basic auth to the platform.
       * @example olivia.admin
       */
      username: string
      /**
       * @description Password for HTTP Basic auth; write-only and never returned.
       * @example s3cr3t-password
       */
      password: string
    }
    PlatformConfigSession: {
      /**
       * @description Discriminator selecting cookie/session-based authentication. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      authType: 'session'
      /**
       * @description Free-form session parameters (e.g. cookies) required by the platform; write-only.
       * @example {
       *       "cookie": "session=abc123"
       *     }
       */
      config: {
        [key: string]: string
      }
    }
    /** @description Request body to merge keys into an operator platform configuration. Omitted keys keep their stored value; `null` clears a key. */
    PlatformConfigSetBody: {
      /** @description Operator credentials/config keys to merge into the platform's stored configuration. */
      config: components['schemas']['PlatformConfigPatch']
    }
    /** @description Partial operator platform configuration. Submitted keys overwrite stored ones, omitted keys are preserved, and `null` clears a key. Adapter-specific keys beyond those named here are accepted and stored verbatim. */
    PlatformConfigPatch: {
      /**
       * @description Accepted for symmetry with `PlatformConfig` and stored as-is; the effective auth type comes from adapter metadata, not from this body. Nullable like every other key, so a stored value can be cleared.
       * @example oauth2
       */
      authType?: ('oauth2' | 'oauth2_cc' | 'api_key' | 'basic' | 'session') | null
      /**
       * @description OAuth client ID issued by the platform.
       * @example opensteward
       */
      clientId?: string | null
      /**
       * @description OAuth client secret; write-only and never returned. Omit to keep the stored secret.
       * @example s3cr3t-client-value
       */
      clientSecret?: string | null
      /**
       * @description Redirect/callback URI registered with the platform. Empty string or `null` clears it.
       * @example https://app.acme.example/return
       */
      redirectUri?: (string | '') | null
      /**
       * @description Token endpoint for the client-credentials flow.
       * @example https://idp.northwind.example/oauth/token
       */
      tokenUrl?: (string | '') | null
      /**
       * @description OAuth scopes to request; defaults to the adapter recommendation if omitted.
       * @example [
       *       "accounting.transactions.read"
       *     ]
       */
      scopes?: string[] | null
      /**
       * @description API key used to authenticate to the platform; write-only and never returned.
       * @example osk_acme_8f3a
       */
      apiKey?: string | null
      /**
       * @description Username for HTTP Basic auth to the platform.
       * @example olivia.admin
       */
      username?: string | null
      /**
       * @description Password for HTTP Basic auth; write-only and never returned.
       * @example s3cr3t-password
       */
      password?: string | null
    } & {
      [key: string]: unknown
    }
    /** @description Editable company/branding fields accepted when updating company info. */
    CompanyInfoInput: {
      /** @example Acme Industries */
      name?: string | null
      /** @example Acme Industries, Inc. */
      legalName?: string | null
      /** @example Industrial supplies and equipment. */
      description?: string | null
      /** @example https://acme.example */
      website?: string | null
      /** @example data:image/svg+xml;base64,PHN2Zz48L3N2Zz4= */
      logoDataUrl?: string | null
      /** @example #1d4ed8 */
      primaryColor?: string | null
      /** @example #0f172a */
      secondaryColor?: string | null
      /** @example Inter, sans-serif */
      fontFamily?: string | null
      /** @example data:font/woff2;base64,d09GMgABAAAAAA== */
      fontDataUrl?: string | null
      /** @example https://fonts.acme.example/inter.css */
      fontUrl?: string | null
      /** @example data:image/png;base64,iVBORw0KGgo= */
      faviconDataUrl?: string | null
      /** @example false */
      hideAttribution?: boolean | null
      /** @example jane.doe@acme.example */
      supportEmail?: string | null
      /** @example https://acme.example/privacy */
      privacyPolicyUrl?: string | null
      /** @example https://acme.example/terms */
      termsOfServiceUrl?: string | null
      /** @example 2500 Market Street */
      addressLine1?: string | null
      /** @example Suite 300 */
      addressLine2?: string | null
      /** @example San Francisco */
      city?: string | null
      /** @example CA */
      region?: string | null
      /** @example 94114 */
      postalCode?: string | null
      /** @example US */
      country?: string | null
      /** @example https://acme.example */
      baseUrl?: string | null
    }
    /** @description Request body to create an end-user. */
    CreateEndUserBody: {
      /**
       * @description Tenant (operator customer) the new end-user belongs to.
       * @example acme
       */
      tenantId: string
      /**
       * Format: email
       * @description Primary email address of the end-user.
       * @example jane.doe@acme.example
       */
      email: string
      /**
       * @description Friendly display name for the end-user.
       * @example Jane Doe
       */
      displayName?: string
      /**
       * @description Operator's own identifier for this end-user.
       * @example acme-industries
       */
      externalReference?: string
      /** @description Optional PII to attach to the new end-user. */
      pii?: components['schemas']['EndUserPii'] | null
    }
    /** @description Personally identifiable information for an end-user; only returned when explicitly requested. */
    EndUserPii: {
      /**
       * @description End-user's given name.
       * @example Jane
       */
      firstName?: string
      /**
       * @description End-user's family name.
       * @example Doe
       */
      lastName?: string
      /**
       * @description National/tax identifier; typically masked in responses.
       * @example ***-**-1234
       */
      personalIdNumber?: string
      /**
       * @description Contact phone number in E.164 or local format.
       * @example +1-415-555-0142
       */
      phone?: string
      /** @description End-user's postal address. */
      address?: components['schemas']['EndUserAddress']
    }
    /** @description Postal address for an end-user, stored as part of their PII. */
    EndUserAddress: {
      /**
       * @description First line of the street address.
       * @example 2500 Market Street
       */
      line1?: string
      /**
       * @description Second address line (suite, unit, etc.).
       * @example Suite 300
       */
      line2?: string
      /**
       * @description City or locality.
       * @example San Francisco
       */
      city?: string
      /**
       * @description State, province, or region.
       * @example CA
       */
      region?: string
      /**
       * @description Postal or ZIP code.
       * @example 94114
       */
      postalCode?: string
      /**
       * @description Country, typically an ISO 3166-1 alpha-2 code.
       * @example US
       */
      country?: string
    }
    /** @description Request body to update an end-user; omitted fields are left unchanged. */
    UpdateEndUserBody: {
      /**
       * @description New display name; pass null to clear it.
       * @example Jane Doe
       */
      displayName?: string | null
      /**
       * @description New external reference; pass null to clear it.
       * @example acme-industries
       */
      externalReference?: string | null
      /** @description New PII to set; pass null to clear stored PII. */
      pii?: components['schemas']['EndUserPii'] | null
    }
    /** @enum {string} */
    ConnectSessionStatus: 'active' | 'consumed' | 'expired'
    /** @description Request body to create a connect session / shareable connect link. */
    CreateConnectSessionBody: {
      /**
       * @description Tenant (operator customer) the new session belongs to.
       * @example acme
       */
      tenantId: string
      /**
       * @description Human-friendly label for the session.
       * @example Acme onboarding
       */
      label: string
      /**
       * @description Existing end-user to bind the session to; omit to create/resolve one from the customer fields.
       * @example cus_4Qm2Xa9Lr
       */
      endUserId?: string
      /**
       * Format: email
       * @description Email used to create or match the end-user when `endUserId` is not supplied.
       * @example jane.doe@acme.example
       */
      customerEmail?: string
      /**
       * @description Display name for the end-user when creating one from this request.
       * @example Jane Doe
       */
      customerDisplayName?: string
      /**
       * @description Restrict the session to these verticals; omit for all enabled verticals.
       * @example [
       *       "accounting"
       *     ]
       */
      allowedVerticals?: string[]
      /**
       * @description Restrict the session to these specific platforms.
       * @example [
       *       {
       *         "vertical": "accounting",
       *         "slug": "xero"
       *       }
       *     ]
       */
      allowedPlatforms?: components['schemas']['AllowedPlatform'][]
      /**
       * Format: uri
       * @description URL the customer returns to after connecting; omit to use the default.
       * @example https://app.acme.example/return
       */
      redirectUrl?: string
      /**
       * @description Expiry as an epoch-millis timestamp; omit to apply the default expiry window.
       * @example 1769949600000
       */
      expiresAt?: number
      /**
       * @description When true, the generated link is consumed after a single successful connection.
       * @example false
       */
      oneTimeOnly?: boolean
      /** @description The sync schedule the connection made through this link starts with; omit for the deployment default. A one-time link always makes a `once` connection and refuses any other mode. */
      syncSchedule?: components['schemas']['ConnectionSyncSchedule']
      /**
       * @description Explicit scopes to request when `scopePolicy` is `custom`; omit otherwise.
       * @example [
       *       "accounting.transactions.read"
       *     ]
       */
      scopes?: string[]
      /**
       * @description How scopes are decided, resolved per-platform at OAuth-start: 'read_only' (default for new links — read scopes, falling back to platform default), 'platform_default' (no override), or 'custom' (use `scopes`).
       * @example read_only
       * @enum {string}
       */
      scopePolicy?: 'read_only' | 'platform_default' | 'custom'
      /**
       * @description When true, the link allows a not-yet-known customer to self-identify during connect.
       * @example false
       */
      allowSelfRegister?: boolean
    } & {
      [key: string]: unknown
    }
    /** @description A specific vertical+platform the customer is permitted to connect through a link. */
    AllowedPlatform: {
      /**
       * @description Vertical the allowed platform belongs to.
       * @example accounting
       */
      vertical: string
      /**
       * @description Slug of the platform the customer is allowed to connect.
       * @example xero
       */
      slug: string
    }
    /** @description Request body to mint a new tenant API key. */
    MintApiKeyBody: {
      /**
       * @description Tenant (operator customer) the new key authenticates as.
       * @example acme
       */
      tenantId: string
      /**
       * @description Optional human-friendly label for the key.
       * @example Production key
       */
      label?: string | null
      /**
       * @description Permission scopes to grant the key; omit for the default scope set.
       * @example [
       *       "customers:read",
       *       "connections:read"
       *     ]
       */
      scopes?: string[]
      /**
       * @description Which surface the key addresses: `live` keys work on `/v1/*`, `test` keys on the `/test/v1/*` sandbox. Omit for `live`.
       * @example live
       * @enum {string}
       */
      mode?: 'live' | 'test'
      /**
       * @description Optional hard expiry, epoch ms. Past it the key no longer authenticates. Omit for a non-expiring key.
       * @example 1782864000000
       */
      expiresAt?: number | null
    }
    /** @description Request body to rotate a tenant API key. */
    RotateApiKeyBody: {
      /**
       * @description Grace window in seconds during which the old key still verifies. Defaults to 86400 (24h); 0 revokes it immediately.
       * @example 3600
       */
      overlapSeconds?: number
      /**
       * @description Optional hard expiry for the REPLACEMENT key, epoch ms. Not inherited from the old key.
       * @example null
       */
      expiresAt?: number | null
    }
    /** @description Read an issuer's OpenID discovery document without saving anything. */
    DiscoverOAuthIssuerBody: {
      /**
       * @description Issuer URL to read the discovery document from.
       * @example https://idp.corp.example/realms/main
       */
      issuer: string
    }
    /** @description Register an identity provider whose tokens the developer API accepts. */
    CreateOAuthIssuerBody: {
      /**
       * @description Operator-facing label.
       * @example Corp Keycloak
       */
      name: string
      /**
       * @description Vendor preset the claim names came from.
       * @example keycloak
       */
      preset?: string
      /**
       * @description The exact `iss` value tokens carry.
       * @example https://idp.corp.example/realms/main
       */
      issuer: string
      /**
       * @description Signing-key endpoint, normally taken from the discovery document.
       * @example https://idp.corp.example/realms/main/protocol/openid-connect/certs
       */
      jwksUri: string
      /**
       * @description The exact `aud` value tokens must carry. Required — a blank audience accepts every token the issuer ever minted.
       * @example https://opensteward.corp.internal
       */
      audience: string
      /**
       * @description Which claim names the calling client.
       * @example azp
       */
      subjectClaim: string
      /**
       * @description Which claim carries the scopes.
       * @example realm_access.roles
       */
      scopeClaim: string
      /**
       * @description Accepted signature algorithms. Asymmetric only.
       * @example [
       *       "RS256"
       *     ]
       */
      algorithms?: string[]
      /**
       * @description Where tenant and scopes come from.
       * @example registry
       * @enum {string}
       */
      authorityMode?: 'registry' | 'intersect' | 'external'
      /**
       * @description External mode only: which claim names the tenant.
       * @example https://opensteward/tenant
       */
      tenantClaim?: string | null
      /**
       * @description External mode only: tenants this issuer may assert. Empty admits nobody.
       * @example [
       *       "acme"
       *     ]
       */
      allowedTenants?: string[]
      /**
       * @description External mode only: reject tokens living longer than this.
       * @example 3600
       */
      maxTokenLifetimeS?: number
      /**
       * @description Whether tokens from it are accepted.
       * @example true
       */
      enabled?: boolean
    }
    /** @description Fields to change. The merged row is validated, not the patch — switching to external authority without naming a tenant claim is refused here rather than failing open at request time. */
    UpdateOAuthIssuerBody: {
      /**
       * @description Operator-facing label.
       * @example Corp Keycloak
       */
      name?: string
      /**
       * @description Vendor preset the claim names came from.
       * @example keycloak
       */
      preset?: string
      /**
       * @description The exact `iss` value tokens carry.
       * @example https://idp.corp.example/realms/main
       */
      issuer?: string
      /**
       * @description Signing-key endpoint, normally taken from the discovery document.
       * @example https://idp.corp.example/realms/main/protocol/openid-connect/certs
       */
      jwksUri?: string
      /**
       * @description The exact `aud` value tokens must carry. Required — a blank audience accepts every token the issuer ever minted.
       * @example https://opensteward.corp.internal
       */
      audience?: string
      /**
       * @description Which claim names the calling client.
       * @example azp
       */
      subjectClaim?: string
      /**
       * @description Which claim carries the scopes.
       * @example realm_access.roles
       */
      scopeClaim?: string
      /**
       * @description Accepted signature algorithms. Asymmetric only.
       * @example [
       *       "RS256"
       *     ]
       */
      algorithms?: string[]
      /**
       * @description Where tenant and scopes come from.
       * @example registry
       * @enum {string}
       */
      authorityMode?: 'registry' | 'intersect' | 'external'
      /**
       * @description External mode only: which claim names the tenant.
       * @example https://opensteward/tenant
       */
      tenantClaim?: string | null
      /**
       * @description External mode only: tenants this issuer may assert. Empty admits nobody.
       * @example [
       *       "acme"
       *     ]
       */
      allowedTenants?: string[]
      /**
       * @description External mode only: reject tokens living longer than this.
       * @example 3600
       */
      maxTokenLifetimeS?: number
      /**
       * @description Whether tokens from it are accepted.
       * @example true
       */
      enabled?: boolean
    }
    /** @description Register a service account against an issuer. */
    CreateOAuthClientBody: {
      /**
       * @description Value of the issuer's subject claim identifying this client.
       * @example billing-service
       */
      subject: string
      /**
       * @description Tenant it authenticates as.
       * @example acme
       */
      tenantId: string
      /**
       * @description Human-friendly label.
       * @example Billing service
       */
      label?: string | null
      /**
       * @description Scopes to grant — the same vocabulary API keys use.
       * @example [
       *       "customers:read"
       *     ]
       */
      scopes: string[]
    }
    /** @description Map one of the IdP's scope values onto an OpenSteward scope. */
    CreateOAuthScopeRuleBody: {
      /**
       * @description A value as it appears in the token's scope claim.
       * @example read:ledger
       */
      claimValue: string
      /**
       * @description The OpenSteward scope it grants.
       * @example vertical:accounting
       */
      grantedScope: string
      /**
       * @description Evaluation order, ascending.
       * @example 0
       */
      priority?: number
    }
    /** @description Request body to mint an API token scoped to a single end-user. */
    MintEndUserTokenBody: {
      /**
       * @description End-user the token will authenticate as (prefix `cus_`).
       * @example cus_4Qm2Xa9Lr
       */
      endUserId: string
      /**
       * @description Tenant the end-user belongs to.
       * @example acme
       */
      tenantId: string
      /**
       * @description Optional human-friendly label for the token.
       * @example Production key
       */
      label?: string | null
      /**
       * @description Permission scopes to grant the token; omit for the default scope set.
       * @example [
       *       "customers:read",
       *       "connections:read"
       *     ]
       */
      scopes?: string[]
    }
    /** @description Request body to create a webhook subscription. The signing secret is returned once in the response. */
    CreateWebhookSubscriptionBody: {
      /**
       * @description Tenant (operator customer) that will own the subscription.
       * @example acme
       */
      tenantId: string
      /**
       * @description HTTPS endpoint that will receive event deliveries.
       * @example https://hooks.acme.example/opensteward
       */
      url: string
      /**
       * @description Optional human-friendly name for the subscription, shown and searched in the admin list.
       * @example Billing service
       */
      label?: string | null
      /**
       * @description Event types to subscribe to; omit to subscribe to all events.
       * @example [
       *       "customer.created"
       *     ]
       */
      events?: string[]
      /**
       * @description Payload shape for this endpoint. Defaults to `opensteward`, the signed event envelope. Use `slack` for a Slack incoming webhook, `teams` for a Teams Workflows URL, `flat` for tools that only map top-level fields.
       * @example slack
       * @enum {string}
       */
      format?: 'opensteward' | 'slack' | 'teams' | 'flat'
      /**
       * @description Custom headers sent with every delivery, for receivers that authenticate by header. Stored encrypted and never returned. Reserved names (`x-oi-*`, `host`, `content-*`, hop-by-hop) are rejected.
       * @example {
       *       "X-Api-Key": "k-123"
       *     }
       */
      headers?: {
        [key: string]: string
      }
    }
    /** @description Request body to change a webhook subscription's label or delivery settings. The URL and event list are immutable. */
    UpdateWebhookSubscriptionBody: {
      /**
       * @description New payload shape for this endpoint.
       * @example slack
       * @enum {string}
       */
      format?: 'opensteward' | 'slack' | 'teams' | 'flat'
      /**
       * @description Replaces the custom headers wholesale; an empty object or null clears them. Values are never returned.
       * @example {
       *       "X-Api-Key": "k-456"
       *     }
       */
      headers?: {
        [key: string]: string
      } | null
      /**
       * @description New human-friendly name for the subscription. Null or a blank string clears it; omit the field to leave it unchanged.
       * @example Billing service
       */
      label?: string | null
    }
    /** @enum {string} */
    SyncJobStatus: 'pending' | 'running' | 'completed' | 'failed'
    /** @description Request body to enqueue a data-sync job for a connection. */
    CreateSyncJobBody: {
      /**
       * @description Connection to sync (prefix `conn_`).
       * @example conn_1042
       */
      connection_id: string
      /**
       * @description Optional URL notified when the sync job completes.
       * @example https://app.acme.example/sync-callback
       */
      callback_url?: string
    }
    /** @description Request body to create a named scope group. */
    CreateScopeGroupBody: {
      /**
       * @description Vertical the scope group applies to.
       * @example accounting
       */
      vertical: string
      /**
       * @description Platform slug the scope group applies to.
       * @example xero
       */
      platform: string
      /**
       * @description Human-friendly label for the scope group.
       * @example Accounting read
       */
      name: string
      /** @description Scopes included in the group. */
      scopes: components['schemas']['ScopeInput']
    }
    /** @description Scopes accepted either as a string array or a delimited string; normalised to a deduped array on save. */
    ScopeInput: string[] | string
    /** @description Request body to update a scope group; omitted fields are left unchanged. */
    UpdateScopeGroupBody: {
      /**
       * @description New label for the scope group.
       * @example Accounting read
       */
      name?: string
      /** @description Replacement set of scopes for the group. */
      scopes?: components['schemas']['ScopeInput']
    }
    /** @description Request body to create a connect-link template. */
    CreateConnectLinkTemplateBody: {
      /**
       * @description Tenant (operator customer) that will own the template.
       * @example acme
       */
      tenantId: string
      /**
       * @description Human-friendly name for the template.
       * @example Acme onboarding
       */
      name: string
      /**
       * @description Optional longer description of the template.
       * @example Onboarding link for Acme Industries.
       */
      description?: string | null
      /**
       * @description How the customer chooses what to connect: `pinned`, `customer-picks-adapter`, or `self-register`.
       * @example pinned
       */
      linkMode: components['schemas']['ConnectLinkMode']
      /**
       * @description Verticals the customer may connect; required/used depending on `linkMode`.
       * @example [
       *       "accounting"
       *     ]
       */
      allowedVerticals?: string[]
      /**
       * @description Specific platforms the customer may connect; required for `pinned` mode.
       * @example [
       *       {
       *         "vertical": "accounting",
       *         "slug": "xero"
       *       }
       *     ]
       */
      allowedPlatforms?: components['schemas']['AllowedPlatform'][]
      /**
       * @description Scope group whose scopes generated links request; omit for defaults.
       * @example 7
       */
      scopeGroupId?: number | null
      /**
       * @description Days a generated link stays valid before expiring; omit for the default.
       * @example 7
       */
      expiryDays?: number
      /**
       * @description When true, generated links are consumed after a single successful connection.
       * @example false
       */
      oneTimeOnly?: boolean
      /**
       * @description URL the customer returns to after connecting; omit for the default.
       * @example https://app.acme.example/return
       */
      redirectUrl?: string | null
    }
    /** @enum {string} */
    ConnectLinkMode: 'pinned' | 'customer-picks-adapter' | 'self-register'
    /** @description Request body to update a connect-link template; omitted fields are left unchanged. */
    UpdateConnectLinkTemplateBody: {
      /**
       * @description New name for the template.
       * @example Acme onboarding
       */
      name?: string
      /**
       * @description New description; pass null to clear it.
       * @example Onboarding link for Acme Industries.
       */
      description?: string | null
      /**
       * @description New link mode controlling what the customer can connect.
       * @example pinned
       */
      linkMode?: components['schemas']['ConnectLinkMode']
      /**
       * @description New set of verticals the customer may connect.
       * @example [
       *       "accounting"
       *     ]
       */
      allowedVerticals?: string[]
      /**
       * @description New set of platforms the customer may connect.
       * @example [
       *       {
       *         "vertical": "accounting",
       *         "slug": "xero"
       *       }
       *     ]
       */
      allowedPlatforms?: components['schemas']['AllowedPlatform'][]
      /**
       * @description New scope group; pass null to clear it.
       * @example 7
       */
      scopeGroupId?: number | null
      /**
       * @description New link validity window in days.
       * @example 7
       */
      expiryDays?: number
      /**
       * @description Whether generated links should be single-use.
       * @example false
       */
      oneTimeOnly?: boolean
      /**
       * @description New post-connect redirect URL; pass null to clear it.
       * @example https://app.acme.example/return
       */
      redirectUrl?: string | null
    }
    /** @description Request body to register a new tenant. */
    CreateTenantBody: {
      /**
       * @description Optional stable tenant id (slug); generated from the name if omitted.
       * @example acme
       */
      id?: string
      /**
       * @description Human-friendly tenant name.
       * @example Acme Industries
       */
      name: string
    }
    /** @description Request body to rename a tenant. */
    UpdateTenantBody: {
      /**
       * @description New human-friendly tenant name.
       * @example Acme Industries
       */
      name: string
    }
    /** @description Request body to attach a custom domain to a tenant. */
    AddTenantDomainBody: {
      /**
       * @description Custom domain to map (lower-cased, no scheme).
       * @example dept-a.acme.com
       */
      domain: string
      /**
       * @description Tenant the domain should resolve to.
       * @example acme
       */
      tenantId: string
    }
    /** @description Request body to clear dashboard tasks. */
    DismissDashboardTasksBody: {
      /**
       * @description Tasks to clear (1..50). Re-clearing a key replaces its fingerprint.
       * @example [
       *       {
       *         "key": "conn:expired:conn_1042",
       *         "fingerprint": "2026-09-01T00:00:00.000Z"
       *       }
       *     ]
       */
      items: components['schemas']['DashboardDismissItem'][]
    }
    /** @description One dashboard task to clear. */
    DashboardDismissItem: {
      /**
       * @description Task key: `conn:expired:<connectionId>`, `platform:creds:<vertical>/<platform>`, `sync:failed:<jobId>`, `refresh:failing:<connectionId>` or `wizard:<step>`. A `vertical:down:*` row is not clearable and is refused.
       * @example conn:expired:conn_1042
       */
      key: string
      /**
       * @description Fingerprint of the condition being cleared, as derived by the dashboard (ISO 8601 for timestamps, empty when the key alone identifies it). The task re-surfaces when the live fingerprint differs.
       * @example 2026-09-01T00:00:00.000Z
       */
      fingerprint: string
    }
    /** @description PATCH body for /api/runtime-settings/{key}. Discriminated on `key`, one branch per value shape, so the `value` field is typed as number / boolean / string / a closed vocabulary / unknown for JSON. */
    UpdateRuntimeSettingBody:
      | components['schemas']['UpdateRuntimeSettingBodyNumber']
      | components['schemas']['UpdateRuntimeSettingBodyBoolean']
      | components['schemas']['UpdateRuntimeSettingBodyString']
      | components['schemas']['UpdateRuntimeSettingBodyJson']
      | components['schemas']['UpdateRuntimeSettingBodyLogosSource']
    /** @description Update body for the 12 number-valued runtime settings: `rate_limit.api_key.per_minute`, `rate_limit.api_key.window_ms`, `rate_limit.mcp_tenant.per_minute`, `rate_limit.mcp_end_user.per_minute`, `rate_limit.connect_link.per_minute`, `connect_link.default_expiry_hours`, `data_store.sync.default_interval_minutes`, `webhooks.delivery_retention_days`, `webhooks.inbound_event_retention_days`, `audit_log.retention_days`, `logos.fetch_delay_ms`, `logos.job_retention_days`. */
    UpdateRuntimeSettingBodyNumber: {
      /**
       * @description Setting key being updated; must equal the `{key}` path parameter. The number-valued settings:
       *     - `rate_limit.api_key.per_minute` — Global default for tenant-scoped API keys on /v1/* routes (requests per window).
       *     - `rate_limit.api_key.window_ms` — Sliding-window length for the per-key rate limit (milliseconds).
       *     - `rate_limit.mcp_tenant.per_minute` — Tenant-mode MCP (mcp:read) budget. Defaults to parity with regular API keys — tenant-mode agents do legitimate cross-customer analytics.
       *     - `rate_limit.mcp_end_user.per_minute` — End-user MCP (mcp:read on eut_ tokens) budget. Keyed on end_user:<id> so two agent installs for the same customer share the budget. Tighter default — a single customer Q&A agent does not need 600/min.
       *     - `rate_limit.connect_link.per_minute` — Public /connect/{token} flow rate limit, keyed on client IP. Stops brute-force token guessing without throttling legitimate retries.
       *     - `connect_link.default_expiry_hours` — Default expiry for newly minted Connect Links when none is set on the form.
       *     - `data_store.sync.default_interval_minutes` — Minutes between syncs for connections on the default schedule. Each sync re-reads every resource from the platform, so a shorter interval costs platform API calls. Held to 15–43200 (30 days); 0 or less means the built-in 360.
       *     - `webhooks.delivery_retention_days` — Days to keep DELIVERED and DEAD outbound webhook deliveries. Their body column holds the full event JSON — customer emails and connection detail included — so unbounded retention is a data-protection liability, not just disk. Defaults to 30 days (delivery bodies are an operational log); set 0 to keep forever. Pending deliveries are never pruned; swept every ~6h by the delivery worker. Existing deployments keep whatever value they already have (seeding never overwrites).
       *     - `webhooks.inbound_event_retention_days` — Days to keep raw INBOUND platform webhook payloads (inbound_events) — order data and other customer PII arrives in these verbatim. 0 = keep forever (the default). Swept together with delivery retention.
       *     - `audit_log.retention_days` — Days of audit-log history to retain. 0 keeps everything forever. When positive, a daily background sweep deletes entries older than this many days (and records an audit.retention.prune entry when it removes any).
       *     - `logos.fetch_delay_ms` — Milliseconds between Brandfetch requests during a logo fetch. Brandfetch publishes 1,000 requests per 5 minutes per IP. 400ms holds the worst case (every logo found on the first attempt, which costs one request and one delay) at 150/min = 750 per 5 minutes. Lower it only if you have an agreement with Brandfetch.
       *     - `logos.job_retention_days` — Days of finished logo-fetch job history to keep. 0 keeps everything forever. Deleting the stored logos clears the history too, since those rows describe fetches whose output no longer exists; the audit log keeps the record either way. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      key:
        | 'rate_limit.api_key.per_minute'
        | 'rate_limit.api_key.window_ms'
        | 'rate_limit.mcp_tenant.per_minute'
        | 'rate_limit.mcp_end_user.per_minute'
        | 'rate_limit.connect_link.per_minute'
        | 'connect_link.default_expiry_hours'
        | 'data_store.sync.default_interval_minutes'
        | 'webhooks.delivery_retention_days'
        | 'webhooks.inbound_event_retention_days'
        | 'audit_log.retention_days'
        | 'logos.fetch_delay_ms'
        | 'logos.job_retention_days'
      /**
       * @description New value for the setting named in `key` (number).
       * @example 600
       */
      value: number
    }
    /** @description Update body for the 12 boolean-valued runtime settings: `features.mcp_enabled`, `features.end_user_mode_enabled`, `features.test_mode_enabled`, `connect_link.one_time_default`, `auth.local_login_enabled`, `auth.dev_api_keys_enabled`, `auth.dev_oauth_enabled`, `auth.sandbox_self_serve_enabled`, `data_store.raw_payload.payments`, `data_store.raw_payload.accounting`, `data_store.sync.scheduler_enabled`, `data_access.mask_financial`. */
    UpdateRuntimeSettingBodyBoolean: {
      /**
       * @description Setting key being updated; must equal the `{key}` path parameter. The boolean-valued settings:
       *     - `features.mcp_enabled` — When false, the integration-server refuses any token carrying mcp:read (403 MCP_DISABLED). Use for emergency disable without redeploying.
       *     - `features.end_user_mode_enabled` — When false, /v1/me/* routes are not mounted, so they 404. Read once at boot — unlike features.mcp_enabled, a change here needs a restart. End-user mode in MCP and the admin mint UX are inert until this is true.
       *     - `features.test_mode_enabled` — When false, the /test/v1/* sandbox refuses every request (503 TEST_MODE_DISABLED) within one settings poll. The live /v1/* surface is untouched either way, and test-mode API keys can still be minted and revoked — they simply have nothing to call.
       *     - `connect_link.one_time_default` — When true, new Connect Links default to one-time read-only mode. Templates and explicit form picks always win.
       *     - `auth.local_login_enabled` — When false, username/password login is rejected for everyone EXCEPT the pinned break-glass admin. Only disable once an SSO provider is verified working.
       *     - `auth.dev_api_keys_enabled` — When false, the integration-server refuses osk_ developer keys on /v1/* with 403 API_KEYS_DISABLED. Read per request, so a flip applies without a redeploy. Refused unless an OIDC issuer is enabled, reachable by somebody, and has actually verified a token — otherwise switching this off locks every developer out. X-Admin-Secret is never gated by it.
       *     - `auth.dev_oauth_enabled` — When true, /v1/* also accepts an OIDC bearer token from an issuer registered under OAuth clients. Defaults off because it means nothing until an issuer exists. Read per request, like features.mcp_enabled.
       *     - `auth.sandbox_self_serve_enabled` — When true, POST /test/v1/keys mints a sandbox API key with NO authentication — a developer evaluating this deployment gets a test key without asking an admin. Each key belongs to a fresh throwaway tenant, works only on the no-egress /test/v1/* sandbox, expires after 7 days, and minting is IP-rate-limited. Bulk-revoke via the mode=test filter on the API keys page. Read per request.
       *     - `data_store.raw_payload.payments` — When true, payments resources carry the full upstream payload under \`raw\`. Off by default: across the payments adapters that payload declares bank account numbers, IBANs and card numbers the canonical schema does not expose (it exposes last4). Card security codes are stripped either way — PCI DSS 3.3.1 permits no exception. Turning this off does NOT clean rows already written, and turning it on does NOT backfill rows already cached — clear the cache after either change.
       *     - `data_store.raw_payload.accounting` — When true, accounting resources carry the full upstream payload under \`metadata\`. Off by default: 17 accounting adapters declare IBAN, bank account or routing numbers there, and the canonical schema has no IBAN field. Turning this off does NOT clean rows already written, and turning it on does NOT backfill rows already cached — clear the cache after either change.
       *     - `data_store.sync.scheduler_enabled` — When false, nothing is synced on a schedule: default and custom schedules wait, and one-time connections without a first sync wait for it. Sync now, the API and the sync right after a Connect Link still run.
       *     - `data_access.mask_financial` — When true, fields classified \`financial\` (amounts, balances, prices) are masked in the admin data viewer and its exports, filters on them are refused, and dashboard metrics that sum them are withheld. Off by default: financial values are tagged but shown to anyone with \`data:read\`. Personal data is masked regardless of this setting unless the reader holds \`data:read_pii\`. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      key:
        | 'features.mcp_enabled'
        | 'features.end_user_mode_enabled'
        | 'features.test_mode_enabled'
        | 'connect_link.one_time_default'
        | 'auth.local_login_enabled'
        | 'auth.dev_api_keys_enabled'
        | 'auth.dev_oauth_enabled'
        | 'auth.sandbox_self_serve_enabled'
        | 'data_store.raw_payload.payments'
        | 'data_store.raw_payload.accounting'
        | 'data_store.sync.scheduler_enabled'
        | 'data_access.mask_financial'
      /**
       * @description New value for the setting named in `key` (boolean).
       * @example true
       */
      value: boolean
    }
    /** @description Update body for the 3 string-valued runtime settings: `auth.break_glass_user_id`, `logos.brandfetch_client_id`, `logos.fetch_referer`. */
    UpdateRuntimeSettingBodyString: {
      /**
       * @description Setting key being updated; must equal the `{key}` path parameter. The string-valued settings:
       *     - `auth.break_glass_user_id` — User id of the local admin that can always log in with a password, even when local login is disabled. Auto-pinned to the first-run admin when empty.
       *     - `logos.brandfetch_client_id` — Brandfetch client ID. Required for logos.source=cdn and to run a logo fetch. NOT a secret — Brandfetch designed it to be embedded in public <img> tags, so it is stored in plaintext. Free at https://brandfetch.com/developers.
       *     - `logos.fetch_referer` — Referer header sent on Brandfetch requests — they reject requests without one. Should match the origin registered for your Brandfetch app. Empty uses the project default. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      key: 'auth.break_glass_user_id' | 'logos.brandfetch_client_id' | 'logos.fetch_referer'
      /**
       * @description New value for the setting named in `key` (string).
       * @example
       */
      value: string
    }
    /** @description Update body for the 4 json-valued runtime settings: `openapi.servers.scheme`, `openapi.servers.host`, `openapi.servers.port`, `openapi.servers.version`. */
    UpdateRuntimeSettingBodyJson: {
      /**
       * @description Setting key being updated; must equal the `{key}` path parameter. The json-valued settings:
       *     - `openapi.servers.scheme` — HTTP scheme for the Swagger UI "Servers" dropdown. Shape: { default: string, enum: string[] }. Edit when going live: {"default":"https","enum":["https","http"]}.
       *     - `openapi.servers.host` — Hostname (no port) for the Servers dropdown. Add staging / prod hostnames to the enum, e.g. {"default":"oi.acme.com","enum":["oi.acme.com","oi-staging.acme.com"]}.
       *     - `openapi.servers.port` — Port (as a string — OpenAPI server variables are strings). Use "443" for HTTPS deployments, "80" for plain HTTP, "3010" for local.
       *     - `openapi.servers.version` — URL-path API version segment (appended to {scheme}://{host}:{port}/ for /v1/{vertical}/* paths only). Add "v2" to the enum when a versioned route ships; /auth/* and /admin/* paths are unaffected. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      key:
        | 'openapi.servers.scheme'
        | 'openapi.servers.host'
        | 'openapi.servers.port'
        | 'openapi.servers.version'
      /**
       * @description New value for the setting named in `key` (json).
       * @example {
       *       "default": "http",
       *       "enum": [
       *         "http",
       *         "https"
       *       ]
       *     }
       */
      value: unknown
    }
    /** @description Update body for runtime setting `logos.source` (enum). Where platform logos come from. none = brand-tinted monogram tiles, no external requests, works air-gapped (the default). cdn = hotlink Brandfetch, the mode they sanction — needs logos.brandfetch_client_id. local = serve logos this deployment has fetched. An unknown value, or cdn with no client ID, falls back to none with a warning. */
    UpdateRuntimeSettingBodyLogosSource: {
      /**
       * @description Setting key being updated; must equal the `{key}` path parameter. The enum-valued settings:
       *     - `logos.source` — Where platform logos come from. none = brand-tinted monogram tiles, no external requests, works air-gapped (the default). cdn = hotlink Brandfetch, the mode they sanction — needs logos.brandfetch_client_id. local = serve logos this deployment has fetched. An unknown value, or cdn with no client ID, falls back to none with a warning. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      key: 'logos.source'
      /**
       * @description New value for the setting named in `key` (enum).
       * @example none
       * @enum {string}
       */
      value: 'none' | 'cdn' | 'local'
    }
    /** @description Create an identity provider. Body is keyed by `protocol` — OIDC, SAML, and LDAP each pin the per-protocol config shape. */
    CreateIdentityProviderBody:
      | components['schemas']['CreateOidcIdentityProviderBody']
      | components['schemas']['CreateSamlIdentityProviderBody']
      | components['schemas']['CreateLdapIdentityProviderBody']
    /** @description Request body to create an OIDC identity provider. */
    CreateOidcIdentityProviderBody: {
      /**
       * @description Human-friendly display name for the IdP.
       * @example Northwind SSO
       */
      name: string
      /**
       * @description URL-safe identifier used in SSO routes; lowercase letters, digits, and hyphens only.
       * @example northwind
       */
      slug: string
      /**
       * @description Discriminator: creates an OpenID Connect provider. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      protocol: 'oidc'
      /**
       * @description Whether the IdP is active immediately; defaults to enabled.
       * @example true
       */
      enabled?: boolean
      /** @description OIDC non-secret config; may be omitted now and filled in later. */
      config?: components['schemas']['OidcConfig']
      secret?: components['schemas']['IdpSecretBundle']
      /**
       * @description When true, users are just-in-time provisioned on first SSO login.
       * @example true
       */
      jitEnabled?: boolean
      /**
       * @description Role for JIT-provisioned users when no mapping rule matches.
       * @example viewer
       */
      defaultRole?: components['schemas']['Role']
    }
    OidcConfig: {
      /**
       * Format: uri
       * @description OIDC issuer URL; the discovery document is fetched from `{issuer}/.well-known/openid-configuration`.
       * @example https://idp.northwind.example
       */
      issuer: string
      /**
       * @description OAuth client ID registered with the OIDC provider.
       * @example opensteward
       */
      clientId: string
      /**
       * @description Space-separated scopes to request; `openid` is always enforced server-side.
       * @default openid profile email
       * @example openid profile email
       */
      scopes: string
      /**
       * @description Name of the claim carrying group membership, used by role-mapping rules.
       * @default groups
       * @example groups
       */
      groupsClaim: string
      /**
       * @description Optional OIDC `prompt` value (e.g. `select_account`, `login`) forwarded on the authorization request.
       * @example select_account
       */
      prompt?: string
      /**
       * @description Optional space-separated `acr_values` requesting a specific authentication context (e.g. an MFA level).
       * @example urn:mace:incommon:iap:silver
       */
      acrValues?: string
    }
    /** @description IdP secret bundle. Write-only — never returned over the API. */
    IdpSecretBundle: {
      /**
       * @description OIDC client secret; write-only.
       * @example s3cr3t-client-value
       */
      clientSecret?: string
      /**
       * @description Password for the LDAP service-account bind DN; write-only.
       * @example s3cr3t-bind-password
       */
      ldapBindPassword?: string
      /**
       * @description SAML service-provider private key (PEM) used to sign requests; write-only.
       * @example -----BEGIN PRIVATE KEY-----
       *     ...
       */
      spPrivateKey?: string
      /**
       * @description SAML service-provider certificate (PEM); write-only.
       * @example -----BEGIN CERTIFICATE-----
       *     ...
       */
      spCertificate?: string
      /**
       * @description SAML IdP signing certificate (PEM) used to verify assertions; write-only.
       * @example -----BEGIN CERTIFICATE-----
       *     ...
       */
      idpCert?: string
    }
    /** @description Request body to create a SAML identity provider. */
    CreateSamlIdentityProviderBody: {
      /**
       * @description Human-friendly display name for the IdP.
       * @example Northwind SSO
       */
      name: string
      /**
       * @description URL-safe identifier used in SSO routes; lowercase letters, digits, and hyphens only.
       * @example northwind
       */
      slug: string
      /**
       * @description Discriminator: creates a SAML provider. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      protocol: 'saml'
      /**
       * @description Whether the IdP is active immediately; defaults to enabled.
       * @example true
       */
      enabled?: boolean
      /** @description SAML non-secret config; may be omitted now and filled in later. */
      config?: components['schemas']['SamlConfig']
      secret?: components['schemas']['IdpSecretBundle']
      /**
       * @description When true, users are just-in-time provisioned on first SSO login.
       * @example true
       */
      jitEnabled?: boolean
      /**
       * @description Role for JIT-provisioned users when no mapping rule matches.
       * @example viewer
       */
      defaultRole?: components['schemas']['Role']
    }
    SamlConfig: {
      /**
       * Format: uri
       * @description IdP single sign-on URL where SAML AuthnRequests are sent.
       * @example https://idp.northwind.example/sso
       */
      entryPoint: string
      /**
       * @description The IdP's entityID/issuer, used to validate the issuer of incoming assertions.
       * @example https://idp.northwind.example/metadata
       */
      idpIssuer: string
      /**
       * @description Our service-provider entityID; the audience the IdP must assert in the response.
       * @example opensteward
       */
      spEntityId: string
      /**
       * @description SAML attribute carrying group membership, used by role-mapping rules.
       * @default groups
       * @example groups
       */
      groupsAttribute: string
      /**
       * @description SAML attribute holding the user's email; falls back to nameID if absent.
       * @default email
       * @example email
       */
      emailAttribute: string
      /**
       * @description SAML attribute holding an https URL of the user's profile picture. When unset, `picture`, `photo`, `photoUrl` and `avatar` are tried. The picture is fetched by admin-api behind an SSRF guard; an uploaded picture is never replaced.
       * @example picture
       */
      pictureAttribute?: string
    }
    /** @description Request body to create an LDAP identity provider. */
    CreateLdapIdentityProviderBody: {
      /**
       * @description Human-friendly display name for the IdP.
       * @example Northwind SSO
       */
      name: string
      /**
       * @description URL-safe identifier used in SSO routes; lowercase letters, digits, and hyphens only.
       * @example northwind
       */
      slug: string
      /**
       * @description Discriminator: creates an LDAP provider. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      protocol: 'ldap'
      /**
       * @description Whether the IdP is active immediately; defaults to enabled.
       * @example true
       */
      enabled?: boolean
      /** @description LDAP non-secret config; may be omitted now and filled in later. */
      config?: components['schemas']['LdapConfig']
      secret?: components['schemas']['IdpSecretBundle']
      /**
       * @description When true, users are just-in-time provisioned on first successful login.
       * @example true
       */
      jitEnabled?: boolean
      /**
       * @description Role for JIT-provisioned users when no mapping rule matches.
       * @example viewer
       */
      defaultRole?: components['schemas']['Role']
    }
    LdapConfig: {
      /**
       * @description LDAP server URL; use `ldaps://` for TLS (required in production).
       * @example ldaps://ldap.northwind.example
       */
      url: string
      /**
       * @description Distinguished name of the service account used to bind and search for users.
       * @example cn=svc,dc=northwind,dc=example
       */
      bindDn: string
      /**
       * @description Base DN under which user entries are searched.
       * @example ou=people,dc=northwind,dc=example
       */
      searchBase: string
      /**
       * @description LDAP search filter with a `{{username}}` placeholder substituted at login time.
       * @default (uid={{username}})
       * @example (uid={{username}})
       */
      searchFilter: string
      /**
       * @description Attribute holding group membership (commonly `memberOf`), used by role-mapping rules.
       * @default memberOf
       * @example memberOf
       */
      groupsAttribute: string
      /**
       * @description Attribute holding the user's email address.
       * @default mail
       * @example mail
       */
      emailAttribute: string
      /**
       * @description Attribute holding the user's display name.
       * @default cn
       * @example cn
       */
      displayNameAttribute: string
    }
    /** @description Request body to update an identity provider; omitted fields are left unchanged. Protocol is immutable. */
    UpdateIdentityProviderBody: {
      /**
       * @description New display name for the IdP.
       * @example Northwind SSO
       */
      name?: string
      /**
       * @description URL-safe identifier used in SSO routes; lowercase letters, digits, and hyphens only.
       * @example northwind
       */
      slug?: string
      /**
       * @description Enable or disable the IdP.
       * @example true
       */
      enabled?: boolean
      /** @description New non-secret config; shape must match the existing provider protocol (which is immutable). */
      config?:
        | components['schemas']['OidcConfig']
        | components['schemas']['SamlConfig']
        | components['schemas']['LdapConfig']
      secret?: components['schemas']['IdpSecretBundle']
      /**
       * @description Enable or disable just-in-time user provisioning on SSO login.
       * @example true
       */
      jitEnabled?: boolean
      /**
       * @description Role for JIT-provisioned users when no mapping rule matches.
       * @example viewer
       */
      defaultRole?: components['schemas']['Role']
      /**
       * @description Replace the stored secret bundle outright when it cannot be decrypted, accepting the loss of any secret not resent in this request. Without it such an update is refused with `409` so a recoverable STORE_SECRET mistake is not turned into permanent credential loss.
       * @example false
       */
      replaceUnreadableSecret?: boolean
    }
    /** @description Request body to create a role-mapping rule for an identity provider. */
    CreateRoleMappingRuleBody: {
      /**
       * @description Evaluation order; lower numbers are checked first and the first match wins.
       * @example 10
       */
      priority?: number
      /**
       * @description Path to the IdP claim/attribute to test, e.g. `groups`.
       * @example groups
       */
      claimPath: string
      /**
       * @description How `matchValue` is compared to the claim: `equals`, `contains`, or `regex`.
       * @example contains
       */
      matchType: components['schemas']['RoleMatchType']
      /**
       * @description Value to compare against the claim using `matchType`.
       * @example opensteward-admins
       */
      matchValue: string
      /**
       * @description Built-in role granted when this rule matches. Required unless `roleId` is given.
       * @example admin
       */
      role?: components['schemas']['Role']
      /**
       * @description Role granted when this rule matches — a built-in id or a custom role id. Takes precedence over `role`.
       * @example operator
       */
      roleId?: string
    }
    /** @enum {string} */
    RoleMatchType: 'equals' | 'contains' | 'regex'
    /** @description Request body to create a scope-mapping rule for an identity provider. */
    CreateScopeMappingRuleBody: {
      /**
       * @description Display order. Every matching scope rule applies; their tenants are unioned.
       * @example 100
       */
      priority?: number
      /**
       * @description Path to the IdP claim/attribute to test, e.g. `groups`.
       * @example groups
       */
      claimPath: string
      /**
       * @description How `matchValue` is compared to the claim: `equals`, `contains`, or `regex`.
       * @example equals
       */
      matchType: components['schemas']['RoleMatchType']
      /**
       * @description Value to compare against the claim using `matchType`.
       * @example acme-support
       */
      matchValue: string
      /**
       * @description Tenants granted when the rule matches; `["*"]` grants every tenant.
       * @example [
       *       "acme"
       *     ]
       */
      tenantIds: string[]
      /**
       * @description Verticals within those tenants: `*` (default) for all, or a list.
       * @example *
       */
      verticals?: '*' | string[]
    }
    /** @description Request body to set an identity provider's default tenant scope. */
    UpdateIdpDefaultScopeBody: {
      /**
       * @description Scope when no scope rule matches: `all` tenants, or `restricted` to `tenantIds`.
       * @example restricted
       */
      mode: components['schemas']['ScopeMode']
      /**
       * @description Tenants granted by the default when `mode` is `restricted`; empty grants none.
       * @example [
       *       "default"
       *     ]
       */
      tenantIds?: string[]
    }
    /** @description Request body to mint a SCIM provisioning token for an identity provider. */
    MintScimTokenBody: {
      /**
       * @description Optional human-friendly label for the SCIM token.
       * @example Production key
       */
      label?: string
    }
    /** @description Form body the IdP POSTs to the SAML Assertion Consumer Service endpoint. */
    SamlAcsBody: {
      /**
       * @description Base64-encoded SAML response POSTed by the IdP to the Assertion Consumer Service.
       * @example PHNhbWxwOlJlc3BvbnNlIC4uLj48L3NhbWxwOlJlc3BvbnNlPg==
       */
      SAMLResponse?: string
      /**
       * @description Opaque relay state echoed back by the IdP, typically the post-login return path.
       * @example /dashboard
       */
      RelayState?: string
    }
    /** @description Credentials submitted to authenticate against an LDAP identity provider. */
    LdapLoginBody: {
      /**
       * @description LDAP username to authenticate.
       * @example olivia.admin
       */
      username?: string
      /**
       * @description The user's LDAP password.
       * @example s3cr3t-password
       */
      password?: string
    }
    /** @description Body carrying the one-time SSO handoff code to exchange for a bearer token. */
    SsoHandoffBody: {
      /**
       * @description One-time handoff code exchanged for a session token after SSO completes.
       * @example sso_8f3a2b9c4d5e6f7a
       */
      code?: string
    }
    /** @description A SCIM 2.0 resource (User or Group); an open object whose fields follow the SCIM schema for the endpoint. */
    ScimResource: {
      [key: string]: unknown
    }
    /** @description Request body to reveal a stored record. */
    DataRevealBody: {
      /**
       * @description Why you need the unmasked record; recorded in the audit log.
       * @example Support ticket #4821
       */
      reason?: string
    }
    /**
     * @description Time buckets for a series: `auto` is day up to 62 days, week up to 182, else month.
     * @example auto
     * @enum {string}
     */
    MetricGranularityParam: 'auto' | 'day' | 'week' | 'month'
    /** @description Request body to create a dashboard. */
    CreateDashboardBody: {
      /**
       * @description Name.
       * @example Weekly revenue
       */
      name: string
      /**
       * @description What the dashboard is for.
       * @example Revenue across our shops.
       */
      description?: string | null
      audience?: components['schemas']['DashboardAudience']
      pinnedTenants?: components['schemas']['DashboardPinnedTenants']
      /**
       * @description Widgets in display order (at most 24).
       * @example [
       *       {
       *         "metricId": "ecommerce.revenue_per_day",
       *         "chart": "bar",
       *         "width": 12
       *       }
       *     ]
       */
      widgets: components['schemas']['DashboardWidget'][]
    }
    /**
     * @description Who can see a dashboard.
     * @example {
     *       "kind": "tenants",
     *       "tenants": [
     *         "acme"
     *       ]
     *     }
     */
    DashboardAudience: {
      /**
       * @description `private` (only the owner), `tenants` (anyone whose tenant access includes any listed tenant) or `everyone` (every dashboards:view holder; setting it needs dashboards:share_all).
       * @example tenants
       * @enum {string}
       */
      kind: 'private' | 'tenants' | 'everyone'
      /**
       * @description For `tenants`: who it is shared with (1–500 tenant ids).
       * @example [
       *       "acme"
       *     ]
       */
      tenants?: string[]
    }
    /**
     * @description Limit the data to these tenants (each viewer still sees only tenants in their own access). `null` = every tenant the viewer can see.
     * @example [
     *       "acme"
     *     ]
     */
    DashboardPinnedTenants: string[] | null
    /** @description One chart on a dashboard. `chart` must be one of its metric's `charts` (`400` otherwise). */
    DashboardWidget: {
      /**
       * @description Metric id from the catalog.
       * @example ecommerce.orders_per_day
       */
      metricId: string
      /**
       * @description Heading shown on the widget; defaults to the metric title.
       * @example Orders (last 30 days)
       */
      title?: string
      chart: components['schemas']['DashboardChart']
      /**
       * @description Width in grid columns, out of 12.
       * @example 6
       */
      width: number
      /**
       * @description Pin the widget to one currency (ISO 4217). Absent or null follows the dashboard view's currency filter; with no filter every currency is drawn separately. Metrics without money or a currency field ignore it.
       * @example EUR
       */
      currency?: string | null
      granularity?: components['schemas']['MetricGranularityParam']
      /**
       * @description Also compute the prior equal-length period; number and gauge charts show the change. Only metrics marked `comparable` use it.
       * @example true
       */
      compare?: boolean
    }
    /**
     * @description How a widget draws its metric.
     * @example line
     * @enum {string}
     */
    DashboardChart:
      | 'number'
      | 'gauge'
      | 'table'
      | 'line'
      | 'area'
      | 'stacked_area'
      | 'bar'
      | 'hbar'
      | 'stacked_bar'
      | 'combo'
      | 'pareto'
      | 'pie'
      | 'donut'
      | 'rose'
      | 'treemap'
      | 'funnel'
      | 'radar'
      | 'histogram'
      | 'boxplot'
      | 'waterfall'
      | 'heatmap'
      | 'calendar'
    /** @description Request body to edit a dashboard. */
    UpdateDashboardBody: {
      /**
       * @description New name.
       * @example Weekly revenue
       */
      name?: string
      /**
       * @description New description; `null` clears it.
       * @example null
       */
      description?: string | null
      audience?: components['schemas']['DashboardAudience']
      pinnedTenants?: components['schemas']['DashboardPinnedTenants']
      /**
       * @description Replacement widget list (at most 24).
       * @example [
       *       {
       *         "metricId": "ecommerce.orders_per_day",
       *         "chart": "line",
       *         "width": 6
       *       }
       *     ]
       */
      widgets?: components['schemas']['DashboardWidget'][]
    }
    /** @description Who sees an embedded Superset dashboard. */
    SupersetSharingBody: {
      audience?: components['schemas']['DashboardAudience']
      pinnedTenants?: components['schemas']['DashboardPinnedTenants']
    }
    /** @description Request body to mint a guest token. */
    SupersetGuestTokenBody: {
      /**
       * @description Registry id of the dashboard (`ssd_…`).
       * @example ssd_0123456789abcdef0123
       */
      dashboardId: string
    }
    /** @description Request body to create a destination. */
    CreateDestinationBody: {
      /**
       * @description Display name.
       * @example Lake (prod)
       */
      name: string
      /**
       * @description Destination type.
       * @example s3
       */
      type: string
      /**
       * @description The type's non-secret settings.
       * @example {
       *       "bucket": "lake",
       *       "region": "eu-west-1"
       *     }
       */
      config: {
        [key: string]: unknown
      }
      /**
       * @description Write-only credentials, by field name (see the type catalog). Never returned or logged.
       * @example {
       *       "accessKeyId": "AKIA…",
       *       "secretAccessKey": "…"
       *     }
       */
      secrets?: {
        [key: string]: string
      }
      scope: components['schemas']['DestinationScope']
      /**
       * @description Export personal data unmasked. Needs `data:read_pii`; you are recorded as approver.
       * @example false
       */
      includePii?: boolean
      /**
       * @description Seconds between runs, 60 to 604800 (default 3600).
       * @example 3600
       */
      intervalSec?: number
      /**
       * @description Run on schedule (default true).
       * @example true
       */
      enabled?: boolean
    }
    /** @description Which records a destination exports. Must lie inside your own tenant (and vertical) scope. */
    DestinationScope: {
      /**
       * @description Owner tenants whose connections are exported, or `*` for every tenant (the only value that also exports connections with no owner tenant).
       * @example [
       *       "acme"
       *     ]
       */
      tenants: '*' | string[]
      /**
       * @description Verticals exported, each with `*` or a list of resource types. Omit to export every vertical.
       * @example {
       *       "crm": "*",
       *       "ecommerce": [
       *         "orders"
       *       ]
       *     }
       */
      verticals?: {
        [key: string]: '*' | string[]
      }
      /**
       * @description Also mask financial fields (amounts, balances).
       * @example false
       */
      maskFinancial?: boolean
    }
    /** @description Request body to change a destination. */
    UpdateDestinationBody: {
      /**
       * @description Display name.
       * @example Lake (prod)
       */
      name?: string
      /**
       * @description The type's full non-secret settings (replaces the stored ones).
       * @example {
       *       "bucket": "lake",
       *       "region": "eu-west-1"
       *     }
       */
      config?: {
        [key: string]: unknown
      }
      scope?: components['schemas']['DestinationScope']
      /**
       * @description Export personal data unmasked. Turning it on needs `data:read_pii`.
       * @example false
       */
      includePii?: boolean
      /**
       * @description Seconds between runs.
       * @example 3600
       */
      intervalSec?: number
      /**
       * @description Run on schedule.
       * @example true
       */
      enabled?: boolean
    }
    /** @description Replace a destination's credentials. */
    DestinationCredentialsBody: {
      /**
       * @description Write-only credentials, by field name (see the type catalog). Never returned or logged.
       * @example {
       *       "accessKeyId": "AKIA…",
       *       "secretAccessKey": "…"
       *     }
       */
      secrets: {
        [key: string]: string
      }
    }
    /** @description Request body to backfill a destination. */
    DestinationBackfillBody: {
      /**
       * @description Only reset this vertical. Omit to re-export everything.
       * @example crm
       */
      vertical?: string
      /**
       * @description Only reset this resource type (needs `vertical`).
       * @example contacts
       */
      resourceType?: string
      /**
       * @description Start a run right away (default true).
       * @example true
       */
      run?: boolean
    }
    /** @description Request body to create a SQL principal. */
    CreateSqlPrincipalBody: {
      /**
       * @description A name for the login; becomes part of the username.
       * @example Metabase prod
       */
      label: string
      /**
       * @description Read the unmasked schema. Needs `data:read_pii`.
       * @example false
       */
      pii?: boolean
      scope: components['schemas']['CreateSqlPrincipalScope']
      /**
       * @description When the login stops working (ISO 8601); omit for never.
       * @example 2027-01-01T00:00:00Z
       */
      expiresAt?: string | null
      /**
       * @description Concurrent sessions allowed (default 5).
       * @example 5
       */
      connectionLimit?: number
    }
    /** @description What the new login may read. */
    CreateSqlPrincipalScope: {
      /**
       * @description Owner tenants, or `*` for every tenant. Must lie inside your scope.
       * @example [
       *       "acme"
       *     ]
       */
      tenants: '*' | string[]
      /**
       * @description Verticals; omit for all.
       * @example [
       *       "crm"
       *     ]
       */
      verticals?: '*' | string[]
    }
    /** @description Successful authentication result: a bearer token plus the authenticated user. */
    AuthTokenResponse: {
      /**
       * @description Signed JWT bearer token; send as `Authorization: Bearer <token>` on subsequent requests.
       * @example eyJhbGciOiJIUzI1NiJ9.olivia
       */
      token: string
      /** @description Identity of the user the token was issued for. */
      user: components['schemas']['MePayload']
    }
    /** @description Which tenants a console user may see. */
    AccessScope: {
      /**
       * @description `all` sees every tenant; `restricted` only the tenants in `grants`.
       * @example restricted
       */
      mode: components['schemas']['ScopeMode']
      /**
       * @description Tenants granted. Empty when `mode` is `all`; a restricted user with none sees nothing.
       * @example [
       *       {
       *         "tenantId": "acme",
       *         "verticals": "*"
       *       }
       *     ]
       */
      grants: components['schemas']['ScopeGrantOutput'][]
    }
    /** @description Identity of the currently authenticated user, derived from the JWT claims. */
    MePayload: {
      /**
       * @description Identifier of the authenticated user (prefix `usr_`).
       * @example usr_olivia
       */
      id: string
      /**
       * @description Login name of the authenticated user.
       * @example olivia.admin
       */
      username: string
      /**
       * @description Email address, or null when none is set. Set by an admin, or copied from the identity provider (OIDC `email`, SAML email attribute, SCIM `emails`).
       * @example olivia@northwind.example
       */
      email?: string | null
      /**
       * @description Path of the profile picture on this API (`GET /api/users/{id}/avatar`), versioned with `?v=` so it changes whenever the picture does; null when the user has none.
       * @example /api/users/usr_olivia/avatar?v=9f86d081884c7d65
       */
      avatarUrl?: string | null
      /**
       * @description Short content hash of the profile picture, for cache-busting a proxied copy; null when the user has none.
       * @example 9f86d081884c7d65
       */
      avatarVersion?: string | null
      /**
       * @description Access level granted to the authenticated user.
       * @example admin
       */
      role: components['schemas']['Role']
      /**
       * @description Effective role (custom role id, or the built-in id). Present on `GET /api/auth/me`; read from the database, so it reflects a change made since the token was issued.
       * @example operator
       */
      roleId?: string
      /**
       * @description Display name of the effective role. Present on `GET /api/auth/me`.
       * @example operator
       */
      roleName?: string
      /**
       * @description Effective permissions. Present on `GET /api/auth/me`.
       * @example [
       *       "connections:read",
       *       "dashboards:view"
       *     ]
       */
      permissions?: components['schemas']['Permission'][]
      /** @description Tenant scope. Present on `GET /api/auth/me`. */
      scope?: components['schemas']['AccessScope']
    } & {
      [key: string]: unknown
    }
    /** @description Standard error response. `error` is a string for terse messages or an object for structured codes; every response also carries an `X-Request-Id` header for correlation. */
    ErrorBody: {
      /**
       * @description Error payload: either a terse string message or a structured object with `code`/`message`.
       * @example Not found
       */
      error:
        | string
        | ({
            /**
             * @description Machine-readable error code, e.g. `invalid_request`.
             * @example invalid_request
             */
            code?: string
            /**
             * @description Human-readable error message.
             * @example Request validation failed.
             */
            message?: string
          } & {
            [key: string]: unknown
          })
      /**
       * @description Coarse error category: `validation`, `auth`, `not_found`, `conflict`, `rate_limit`, or `internal`.
       * @example not_found
       */
      type?: string
      /**
       * @description Correlation id for the request; also returned in the `X-Request-Id` response header. Quote it when reporting an issue.
       * @example req-8f3a2b9c
       */
      requestId?: string
      /**
       * @description Validation issues (e.g. from Zod) when the error stems from request validation.
       * @example []
       */
      issues?: unknown[]
      /**
       * @description Additional detail, often forwarded from an upstream error.
       * @example Upstream returned 404.
       */
      detail?: string
    } & {
      [key: string]: unknown
    }
    /** @description Whether the admin user table has been initialised. */
    HasUsersResponse: {
      /**
       * @description True once at least one admin user exists.
       * @example false
       */
      hasUsers: boolean
    }
    /** @description Response of `GET /api/auth/me` describing the current session, or null when not signed in. */
    MeResponse: {
      /** @description The authenticated user, or null if the request is unauthenticated. */
      user: components['schemas']['MePayload'] | null
    }
    /** @description An admin-console user account (id, login, role, and audit timestamps). */
    User: {
      /**
       * @description Stable identifier for the admin user (prefix `usr_`).
       * @example usr_olivia
       */
      id: string
      /**
       * @description Login name used for local (password) authentication; unique within the deployment.
       * @example olivia.admin
       */
      username: string
      /**
       * @description Email address, or null when none is set. Set by an admin, or copied from the identity provider (OIDC `email`, SAML email attribute, SCIM `emails`).
       * @example olivia@northwind.example
       */
      email?: string | null
      /**
       * @description Path of the profile picture on this API (`GET /api/users/{id}/avatar`), versioned with `?v=` so it changes whenever the picture does; null when the user has none.
       * @example /api/users/usr_olivia/avatar?v=9f86d081884c7d65
       */
      avatarUrl?: string | null
      /**
       * @description Short content hash of the profile picture, for cache-busting a proxied copy; null when the user has none.
       * @example 9f86d081884c7d65
       */
      avatarVersion?: string | null
      /**
       * @description Access level: `admin` (full control), `operator` (manage resources), or `viewer` (read-only).
       * @example admin
       */
      role: components['schemas']['Role']
      /**
       * @description Effective role id: a custom role id, or the built-in id when no custom role is assigned.
       * @example operator
       */
      roleId?: string
      /**
       * @description Display name of the effective role.
       * @example operator
       */
      roleName?: string
      /** @description `restricted` when the account only sees some tenants. */
      scopeMode?: components['schemas']['ScopeMode']
      /**
       * @description When the user account was created (ISO 8601); null when not recorded.
       * @example 2026-01-15T09:30:00Z
       */
      createdAt?: string | null
      /**
       * @description When the user account was last modified (ISO 8601); null if never updated.
       * @example 2026-02-01T14:20:00Z
       */
      updatedAt?: string | null
    } & {
      [key: string]: unknown
    }
    /** @description Pagination metadata describing the current page and page size. */
    PaginationMeta: {
      /**
       * @description 1-based page number of the returned results.
       * @example 1
       */
      page: number
      /**
       * @description Maximum number of items per page.
       * @example 50
       */
      limit: number
      /**
       * @description Total number of items across all pages.
       * @example 1
       */
      total: number
    }
    /** @description One console account with its identity links and break-glass status. */
    UserDetail: {
      /**
       * @description Stable account identifier.
       * @example usr_olivia
       */
      id: string
      /**
       * @description Login name.
       * @example olivia.admin
       */
      username: string
      /**
       * @description Email address, or null when none is set. Set by an admin, or copied from the identity provider (OIDC `email`, SAML email attribute, SCIM `emails`).
       * @example olivia@northwind.example
       */
      email?: string | null
      /**
       * @description Path of the profile picture on this API (`GET /api/users/{id}/avatar`), versioned with `?v=` so it changes whenever the picture does; null when the user has none.
       * @example /api/users/usr_olivia/avatar?v=9f86d081884c7d65
       */
      avatarUrl?: string | null
      /**
       * @description Short content hash of the profile picture, for cache-busting a proxied copy; null when the user has none.
       * @example 9f86d081884c7d65
       */
      avatarVersion?: string | null
      /**
       * @description `manual` when an admin set the email (SSO never overwrites it); `idp` when it is copied from the identity provider and refreshed at every SSO sign-in or SCIM update; null without an email.
       * @example manual
       */
      emailSource?: ('manual' | 'idp') | null
      /**
       * @description `upload` when a person uploaded the picture (SSO never replaces it); `idp` when it was fetched from the identity provider’s picture URL; null without a picture.
       * @example upload
       */
      avatarSource?: ('upload' | 'idp') | null
      /**
       * @description Access level.
       * @example admin
       */
      role: string
      /**
       * @description Effective role: a custom role id, or the built-in id when none is assigned.
       * @example admin
       */
      roleId?: string
      /**
       * @description Display name of the effective role.
       * @example admin
       */
      roleName?: string
      /** @description Which tenants the account may see. */
      scope?: components['schemas']['AccessScope']
      /**
       * @description `idp` when the scope is re-derived from IdP scope rules on every SSO login; `manual` when an admin set it.
       * @example manual
       * @enum {string}
       */
      scopeSource?: 'manual' | 'idp'
      /**
       * Format: date-time
       * @description When the account was created (ISO 8601).
       * @example 2026-01-04T10:00:00.000Z
       */
      createdAt: string
      /**
       * Format: date-time
       * @description When the account was last modified (ISO 8601).
       * @example 2026-02-11T16:30:00.000Z
       */
      updatedAt: string
      /**
       * @description Identity-provider links for this account; empty for a local password account.
       * @example []
       */
      links: components['schemas']['IdentityLink'][]
      /**
       * @description True when the account signs in only through an identity provider. SCIM- and JIT-provisioned accounts are given an unusable random password, so this is derived from the presence of links rather than from the stored hash.
       * @example false
       */
      ssoOnly: boolean
      /**
       * @description True when this is a password-usable local admin (role `admin` with no identity links) — the set `assertBreakGlassPreserved` refuses to empty.
       * @example true
       */
      isLocalAdmin: boolean
      /**
       * @description True when `auth.break_glass_user_id` names this account, which lets it sign in with a password even while local login is disabled.
       * @example false
       */
      isPinnedBreakGlass: boolean
    }
    /** @description A link between a console account and an identity-provider subject. */
    IdentityLink: {
      /**
       * @description Identity provider this link belongs to.
       * @example idp_okta
       */
      providerId: string
      /**
       * @description Display name of the provider, or null if it has since been removed.
       * @example Okta
       */
      providerName: string | null
      /**
       * @description The subject this account maps to in the identity provider — for SCIM the client's `externalId` or `userName`, for JIT the email the account was provisioned from. Identifying data: present only when the caller passed `include_identity=true`, which writes a `user.pii_reveal` audit entry. Null otherwise.
       * @example olivia@northwind.example
       */
      externalId: string | null
      /**
       * @description When this identity last signed in (ISO 8601), or null if never.
       * @example 2026-08-27T09:14:00.000Z
       */
      lastLoginAt: string | null
      /**
       * @description True when the provider provisions this account over SCIM.
       * @example true
       */
      scimManaged: boolean
    }
    /** @description The newly created user (without credentials). */
    CreatedUser: {
      /**
       * @description Identifier assigned to the new user (prefix `usr_`).
       * @example usr_olivia
       */
      id: string
      /**
       * @description Login name of the created user.
       * @example olivia.admin
       */
      username: string
      /**
       * @description Access level granted to the created user.
       * @example admin
       */
      role: components['schemas']['Role']
      /**
       * @description Email address, or null when none was given.
       * @example olivia@northwind.example
       */
      email?: string | null
    }
    /** @description A console user's stored profile picture. */
    UserAvatar: {
      /**
       * @description Where the picture is served, versioned with `?v=` so a change busts caches.
       * @example /api/users/usr_olivia/avatar?v=9f86d081884c7d65
       */
      avatarUrl: string
      /**
       * @description Short content hash of the picture.
       * @example 9f86d081884c7d65
       */
      avatarVersion: string
      /**
       * @description Image type identified from the bytes.
       * @example image/png
       * @enum {string}
       */
      contentType: 'image/png' | 'image/jpeg' | 'image/webp'
      /**
       * @description Size in bytes.
       * @example 48213
       */
      byteSize: number
      /**
       * @description `upload` for a picture set through this API; `idp` for one fetched from the identity provider.
       * @example upload
       * @enum {string}
       */
      source: 'upload' | 'idp'
    }
    /** @description A permission from the catalog and which built-in roles hold it. */
    PermissionInfo: {
      /**
       * @description Permission identifier.
       * @example data:read_pii
       */
      id: components['schemas']['Permission']
      /**
       * @description What holding the permission allows.
       * @example Reveal masked PII fields in synced records (every reveal is audited).
       */
      description: string
      /**
       * @description Built-in roles that hold this permission.
       * @example [
       *       "admin"
       *     ]
       */
      builtinRoles: components['schemas']['Role'][]
    }
    /** @description A built-in or custom role and the permissions it grants. */
    RoleDefinition: {
      /**
       * @description Role id: `admin`, `operator` or `viewer` for built-ins, a UUID for custom roles.
       * @example operator
       */
      id: string
      /**
       * @description Display name; unique, case-insensitively.
       * @example Support lead
       */
      name: string
      /**
       * @description What the role is for; null when unset.
       * @example Reads data for the accounts they support.
       */
      description: string | null
      /**
       * @description Built-in level a holder is treated as by role-gated routes (and in the JWT).
       * @example operator
       */
      baseRole: components['schemas']['Role']
      /**
       * @description Effective permissions. For built-ins these are defined in code.
       * @example [
       *       "connections:read",
       *       "data:read"
       *     ]
       */
      permissions: components['schemas']['Permission'][]
      /**
       * @description True for the three immutable built-in roles.
       * @example false
       */
      isBuiltin: boolean
      /**
       * Format: date-time
       * @description When the role was created (ISO 8601).
       * @example 2026-01-15T09:30:00Z
       */
      createdAt: string
      /**
       * Format: date-time
       * @description When the role was last changed (ISO 8601).
       * @example 2026-02-01T14:20:00Z
       */
      updatedAt: string
      /**
       * @description User who last changed it; null for seeded built-ins.
       * @example usr_olivia
       */
      updatedBy: string | null
    }
    /** @description A console user's tenant scope and who owns it. */
    UserScope: {
      /**
       * @description `all` sees every tenant; `restricted` only the tenants in `grants`.
       * @example restricted
       */
      mode: components['schemas']['ScopeMode']
      /**
       * @description Tenants granted. Empty when `mode` is `all`; a restricted user with none sees nothing.
       * @example [
       *       {
       *         "tenantId": "acme",
       *         "verticals": "*"
       *       }
       *     ]
       */
      grants: components['schemas']['ScopeGrantOutput'][]
      /**
       * @description `idp` when IdP scope rules own the scope; `manual` when an admin set it.
       * @example manual
       * @enum {string}
       */
      source: 'manual' | 'idp'
    }
    /** @description Health summary for a single vertical service and its registered adapters. */
    VerticalHealth: {
      /**
       * @description Name of the vertical, e.g. `accounting`.
       * @example accounting
       */
      name: string
      /**
       * @description Health of the vertical service: `up` (reachable) or `down`.
       * @example up
       * @enum {string}
       */
      status: 'up' | 'down'
      /**
       * @description Number of platform adapters registered for this vertical.
       * @example 4
       */
      adapterCount: number
      /**
       * @description Error detail when the vertical is `down`; absent when healthy.
       * @example adapter timeout
       */
      error?: string
    } & {
      [key: string]: unknown
    }
    /** @description A live platform connection (OAuth/credential link) owned by a tenant, with its credential health. */
    Connection: {
      /**
       * @description Identifier of the connection (prefix `conn_`).
       * @example conn_1042
       */
      id: string
      /**
       * @description Slug of the connected platform/adapter, e.g. `xero`.
       * @example xero
       */
      platform: string
      /**
       * @description Vertical the platform belongs to, e.g. `accounting`.
       * @example accounting
       */
      vertical: string
      /**
       * @description Tenant (operator customer) that owns this connection; null when the connection is not scoped to a tenant.
       * @example acme
       */
      tenantId?: string | null
      /**
       * @description Human-friendly name for the connection; null if unset.
       * @example Acme onboarding
       */
      label?: string | null
      /**
       * @description Credential health: `valid`, `expiring_soon`, `expired` (customer must re-authorize), or `platform_error` (the platform OAuth client credentials were rejected — operator must fix the client id/secret).
       * @example valid
       */
      status: components['schemas']['ConnectionStatus']
      /**
       * @description When the connection credentials expire (ISO 8601); null if they do not expire.
       * @example 2026-03-01T09:30:00.000Z
       */
      expiresAt?: string | null
      /**
       * @description When the connection was first established (ISO 8601).
       * @example 2026-01-15T09:30:00.000Z
       */
      createdAt: string
      /**
       * @description When the connection was last modified (ISO 8601).
       * @example 2026-02-01T10:00:00.000Z
       */
      updatedAt: string
      /**
       * @description When the connection token was last refreshed (ISO 8601); null if never refreshed.
       * @example 2026-02-01T14:20:00Z
       */
      lastRefreshAt?: string | null
      /**
       * @description Outcome of the most recent token refresh attempt; null if never refreshed.
       * @example ok
       */
      lastRefreshStatus?: ('ok' | 'failed' | 'expired' | 'platform_error') | null
      /**
       * @description Why the most recent refresh attempt failed — the OAuth error code, its description and the HTTP status. Null when the last attempt succeeded. Never contains the response body or request headers.
       * @example invalid_grant — Refresh token has expired — HTTP 400
       */
      lastRefreshError?: string | null
      /**
       * @description How often the connection is re-synced: `default`, `custom`, `trigger_only` or `once`. See `ConnectionSyncSchedule`.
       * @example default
       * @enum {string}
       */
      syncMode?: 'default' | 'custom' | 'trigger_only' | 'once'
      /**
       * @description Minutes between syncs for a `custom` schedule; null otherwise.
       * @example null
       */
      syncIntervalMinutes?: number | null
      /** @description Last and next sync as the scheduler sees them; null when the deployment runs in passthrough mode and syncs nothing. */
      sync?: components['schemas']['ConnectionSyncState'] | null
    } & {
      [key: string]: unknown
    }
    /** @enum {string} */
    ConnectionStatus: 'valid' | 'expiring_soon' | 'expired' | 'platform_error'
    /** @description A connection’s sync schedule as the scheduler sees it right now. */
    ConnectionSyncState: {
      /**
       * @description The schedule in force.
       * @example default
       * @enum {string}
       */
      mode: 'default' | 'custom' | 'trigger_only' | 'once'
      /**
       * @description The connection’s own interval; null unless `mode` is `custom`.
       * @example null
       */
      intervalMinutes: number | null
      /**
       * @description The interval that applies — the custom one or the deployment’s; null for `trigger_only` and `once`.
       * @example 360
       */
      effectiveIntervalMinutes: number | null
      /**
       * @description The deployment interval, for labelling the default choice.
       * @example 360
       */
      defaultIntervalMinutes: number
      /**
       * @description When the last successful sync finished (epoch ms); null if never.
       * @example 1769949600000
       */
      lastSyncedAt: number | null
      /**
       * @description When the last sync of any outcome finished (epoch ms).
       * @example 1769949600000
       */
      lastAttemptAt: number | null
      /**
       * @description Outcome of the last finished sync.
       * @example completed
       */
      lastStatus: ('completed' | 'failed') | null
      /**
       * @description Failed syncs since the last success; retries back off from 15 minutes.
       * @example 0
       */
      consecutiveFailures: number
      /**
       * @description A sync is pending or running now.
       * @example false
       */
      active: boolean
      /**
       * @description When the scheduler will next queue a sync (epoch ms); null when it will not on its own — trigger only, a spent one-time sync, a sync in flight, or paused.
       * @example 1769971200000
       */
      nextSyncAt: number | null
      /**
       * @description Why an automatic schedule is on hold.
       * @example null
       */
      pausedReason: ('needs_reauthorization' | 'platform_error') | null
    }
    /** @description An operator-facing notification, e.g. an alert that a connection is expiring soon. */
    Notification: {
      /**
       * @description Numeric identifier of the notification.
       * @example 1042
       */
      id: number
      /**
       * @description Notification type code: `vertical_down`, `platform_credentials_invalid`, `credential_expired` or `credential_expiring`.
       * @example credential_expiring
       */
      type: string
      /**
       * @description Vertical the notification relates to; null if not vertical-specific.
       * @example accounting
       */
      vertical: string | null
      /**
       * @description Connection the notification concerns; null if not connection-specific.
       * @example conn_1042
       */
      connectionId: string | null
      /**
       * @description Platform the notification concerns; null if not platform-specific.
       * @example xero
       */
      platform: string | null
      /**
       * @description Human-readable notification text shown in the admin UI.
       * @example Connection conn_1042 expires in 3 days.
       */
      message: string
      /**
       * @description Whether the notification has been acknowledged: 0 = unread, 1 = acknowledged.
       * @example 0
       */
      acknowledged: number
      /**
       * Format: date-time
       * @description When the notification was raised (ISO 8601).
       * @example 2026-01-15T09:30:00Z
       */
      createdAt: string
    }
    /** @description The number the admin UI shows on the header bell. */
    UnreadNotificationCount: {
      /**
       * @description Unacknowledged notifications, excluding `credential_expiring` (which auto-heals within a poll and would keep the badge from ever reaching zero).
       * @example 2
       */
      count: number
    }
    /** @description A single audit-log entry recording who did what, to which resource, and when. */
    AuditEntry: {
      /**
       * @description Monotonic numeric identifier of the audit-log entry.
       * @example 1042
       */
      id: number
      /**
       * @description User who performed the action (prefix `usr_`).
       * @example usr_olivia
       */
      userId: string
      /**
       * @description Username of the operator who performed the action, resolved at read time. Falls back to the raw user id when the account has since been deleted, and is the literal `system` for actions taken by a background worker.
       * @example olivia
       */
      username: string
      /**
       * @description Machine-readable action code, e.g. `api_key.mint`, `user.login`.
       * @example api_key.mint
       */
      action: string
      /**
       * @description Vertical the action targeted, if applicable; null otherwise.
       * @example accounting
       */
      vertical: string | null
      /**
       * @description Identifier of the resource acted upon; null when not resource-specific.
       * @example key_1042
       */
      targetId: string | null
      /**
       * @description Typed per-action payload (discriminated by `action`, grouped by shape); null when the action carries no extra detail.
       * @example {
       *       "action": "api_key.mint"
       *     }
       */
      detail: components['schemas']['AuditDetail'] | null
      /**
       * Format: date-time
       * @description When the action occurred (ISO 8601).
       * @example 2026-01-15T09:30:00Z
       */
      createdAt: string
    }
    /** @description Per-action audit-log detail, keyed by `action`. Branches are grouped by shape: each lists the actions that share its fields, so an `action` value picks exactly one branch. */
    AuditDetail:
      | components['schemas']['AuditDetailSchemaMigrate']
      | components['schemas']['AuditDetailUserCreate']
      | components['schemas']['AuditDetailUserUpdate']
      | components['schemas']['AuditDetailActionOnly']
      | components['schemas']['AuditDetailFailures']
      | components['schemas']['AuditDetailSsoLogin']
      | components['schemas']['AuditDetailSsoProviderCreate']
      | components['schemas']['AuditDetailSsoRoleMappingCreate']
      | components['schemas']['AuditDetailProviderId']
      | components['schemas']['AuditDetailNameTenantId']
      | components['schemas']['AuditDetailConnectionSyncSchedule']
      | components['schemas']['AuditDetailOAuthIssuerCreate']
      | components['schemas']['AuditDetailOAuthIssuerUpdate']
      | components['schemas']['AuditDetailOAuthIssuerDelete']
      | components['schemas']['AuditDetailOAuthClientCreate']
      | components['schemas']['AuditDetailOAuthClientRevoke']
      | components['schemas']['AuditDetailApiKeyRotate']
      | components['schemas']['AuditDetailUserAvatarUpdate']
      | components['schemas']['AuditDetailBeforeAfter']
      | components['schemas']['AuditDetailNamePlatform']
      | components['schemas']['AuditDetailAuditExport']
      | components['schemas']['AuditDetailAuditRetentionPrune']
      | components['schemas']['AuditDetailLogoFetchStart']
      | components['schemas']['AuditDetailLogoFetchCancel']
      | components['schemas']['AuditDetailLogoFetchFinish']
      | components['schemas']['AuditDetailLogoFetchPurge']
      | components['schemas']['AuditDetailName']
      | components['schemas']['AuditDetailDomain']
      | components['schemas']['AuditDetailDashboardTaskDismiss']
      | components['schemas']['AuditDetailUserRoleAssign']
      | components['schemas']['AuditDetailModeTenantIds']
      | components['schemas']['AuditDetailDataPiiReveal']
      | components['schemas']['AuditDetailDataExport']
      | components['schemas']['AuditDetailDashboardShare']
      | components['schemas']['AuditDetailSupersetGuestToken']
      | components['schemas']['AuditDetailSupersetRegistrySync']
      | components['schemas']['AuditDetailSupersetShare']
      | components['schemas']['AuditDetailDestinationCreate']
      | components['schemas']['AuditDetailDestinationUpdate']
      | components['schemas']['AuditDetailDestinationDelete']
      | components['schemas']['AuditDetailDestinationRun']
      | components['schemas']['AuditDetailDestinationBackfill']
      | components['schemas']['AuditDetailDestinationCredentialsRotate']
      | components['schemas']['AuditDetailDestinationTest']
      | components['schemas']['AuditDetailSqlAccessProvision']
      | components['schemas']['AuditDetailSqlAccessPrincipalCreate']
      | components['schemas']['AuditDetailPrincipalIdUsernameSessionsTerminated']
    /** @description Audit detail for a schema migration being applied. */
    AuditDetailSchemaMigrate: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'schema.migrate'
      /**
       * @description Schema version that was applied.
       * @example 12
       */
      version: number
      /**
       * @description How long the migration took, in milliseconds.
       * @example 184
       */
      durationMs: number
    }
    /** @description Audit detail for `user.create`. */
    AuditDetailUserCreate: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'user.create'
      /**
       * @description Login name of the user that was created.
       * @example olivia.admin
       */
      username: string
      /**
       * @description Role assigned to the new user.
       * @example admin
       * @enum {string}
       */
      role: 'admin' | 'operator' | 'viewer'
      /**
       * @description True when the account was created with an email address. The address itself is never recorded.
       * @example true
       */
      emailSet?: boolean
    }
    /** @description Audit detail for `user.update`. */
    AuditDetailUserUpdate: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'user.update'
      /**
       * @description True when the update set, changed or cleared the email address. The address itself is never recorded.
       * @example true
       */
      emailChanged?: boolean
      /**
       * @description The new role, when the update changed it.
       * @example operator
       */
      role?: string
      /**
       * @description True when the change made the user an admin and so lifted their tenant restriction.
       * @example true
       */
      scopeCleared?: boolean
      /**
       * @description True when the update reset the password. The password itself is never recorded.
       * @example true
       */
      passwordChanged?: boolean
    }
    /** @description Audit detail shape shared by 39 actions (`user.delete`, `user.login`, `sso.provider.update`, `sso.provider.delete`, `sso.role_mapping.delete`, `sso.scim_token.mint`, `sso.scim_token.revoke`, `connect_session.create`, `connect_session.revoke`, `connection.create`, `connection.delete`, `connection.update`, `api_key.mint`, `api_key.revoke`, `end_user.create`, `end_user.update`, `end_user.delete`, `user.pii_reveal`, `user.avatar_delete`, `end_user.pii_reveal`, `end_user_token.mint`, `end_user_token.revoke`, `webhook_sub.create`, `webhook_sub.delete`, `webhook_sub.pause`, `webhook_sub.rotate_secret`, `webhook_sub.update`, `webhook_sub.test`, `webhook_delivery.replay`, `sync_job.create`, `sync_job.cancel`, `company_info.update`, `company_info.reset`, `adapter.enable`, `adapter.disable`, `adapter.config`, `tenant.delete`, `dashboard_task.undismiss`, `role.delete`): the action code alone, no further fields. */
    AuditDetailActionOnly: {
      /**
       * @description Action code identifying this audit entry. One of: `user.delete`, `user.login`, `sso.provider.update`, `sso.provider.delete`, `sso.role_mapping.delete`, `sso.scim_token.mint`, `sso.scim_token.revoke`, `connect_session.create`, `connect_session.revoke`, `connection.create`, `connection.delete`, `connection.update`, `api_key.mint`, `api_key.revoke`, `end_user.create`, `end_user.update`, `end_user.delete`, `user.pii_reveal`, `user.avatar_delete`, `end_user.pii_reveal`, `end_user_token.mint`, `end_user_token.revoke`, `webhook_sub.create`, `webhook_sub.delete`, `webhook_sub.pause`, `webhook_sub.rotate_secret`, `webhook_sub.update`, `webhook_sub.test`, `webhook_delivery.replay`, `sync_job.create`, `sync_job.cancel`, `company_info.update`, `company_info.reset`, `adapter.enable`, `adapter.disable`, `adapter.config`, `tenant.delete`, `dashboard_task.undismiss`, `role.delete`. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action:
        | 'user.delete'
        | 'user.login'
        | 'sso.provider.update'
        | 'sso.provider.delete'
        | 'sso.role_mapping.delete'
        | 'sso.scim_token.mint'
        | 'sso.scim_token.revoke'
        | 'connect_session.create'
        | 'connect_session.revoke'
        | 'connection.create'
        | 'connection.delete'
        | 'connection.update'
        | 'api_key.mint'
        | 'api_key.revoke'
        | 'end_user.create'
        | 'end_user.update'
        | 'end_user.delete'
        | 'user.pii_reveal'
        | 'user.avatar_delete'
        | 'end_user.pii_reveal'
        | 'end_user_token.mint'
        | 'end_user_token.revoke'
        | 'webhook_sub.create'
        | 'webhook_sub.delete'
        | 'webhook_sub.pause'
        | 'webhook_sub.rotate_secret'
        | 'webhook_sub.update'
        | 'webhook_sub.test'
        | 'webhook_delivery.replay'
        | 'sync_job.create'
        | 'sync_job.cancel'
        | 'company_info.update'
        | 'company_info.reset'
        | 'adapter.enable'
        | 'adapter.disable'
        | 'adapter.config'
        | 'tenant.delete'
        | 'dashboard_task.undismiss'
        | 'role.delete'
    }
    /** @description Audit detail shape shared by 2 actions (`user.lockout.temporary`, `user.lockout.permanent`). */
    AuditDetailFailures: {
      /**
       * @description Action code identifying this audit entry. One of: `user.lockout.temporary`, `user.lockout.permanent`. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'user.lockout.temporary' | 'user.lockout.permanent'
      /**
       * @description Consecutive failed login attempts that triggered the temporary lockout.
       * @example 5
       */
      failures: number
    }
    /** @description Audit detail for `sso.login`. */
    AuditDetailSsoLogin: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'sso.login'
      /**
       * @description True if the user was just-in-time provisioned during this login.
       * @example false
       */
      created: boolean
      /**
       * @description Role the user holds after this SSO login.
       * @example viewer
       * @enum {string}
       */
      role: 'admin' | 'operator' | 'viewer'
      /**
       * @description True if role mapping changed the user’s role on this login (OIDC/SAML paths only).
       * @example false
       */
      roleChanged?: boolean
      /**
       * @description Present and set to `ldap` when the login came via the LDAP path.
       * @example ldap
       * @constant
       */
      protocol?: 'ldap'
    }
    /** @description Audit detail for `sso.provider.create`. */
    AuditDetailSsoProviderCreate: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'sso.provider.create'
      /**
       * @description Protocol of the identity provider that was created.
       * @example oidc
       * @enum {string}
       */
      protocol: 'saml' | 'oidc' | 'ldap'
      /**
       * @description Slug assigned to the new identity provider.
       * @example northwind
       */
      slug: string
    }
    /** @description Audit detail for `sso.role_mapping.create`. */
    AuditDetailSsoRoleMappingCreate: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'sso.role_mapping.create'
      /**
       * @description Role the created mapping rule grants.
       * @example admin
       * @enum {string}
       */
      role: 'admin' | 'operator' | 'viewer'
    }
    /** @description Audit detail shape shared by 7 actions (`sso.scim.provision`, `sso.scim.deprovision`, `sso.scim.group.create`, `sso.scim.group.update`, `sso.scim.group.delete`, `idp.scope_rule.create`, `idp.scope_rule.delete`). */
    AuditDetailProviderId: {
      /**
       * @description Action code identifying this audit entry. One of: `sso.scim.provision`, `sso.scim.deprovision`, `sso.scim.group.create`, `sso.scim.group.update`, `sso.scim.group.delete`, `idp.scope_rule.create`, `idp.scope_rule.delete`. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action:
        | 'sso.scim.provision'
        | 'sso.scim.deprovision'
        | 'sso.scim.group.create'
        | 'sso.scim.group.update'
        | 'sso.scim.group.delete'
        | 'idp.scope_rule.create'
        | 'idp.scope_rule.delete'
      /**
       * @description Identity provider the SCIM operation originated from (prefix `idp_`).
       * @example idp_northwind
       */
      providerId: string
    }
    /** @description Audit detail shape shared by 3 actions (`connect_link_template.create`, `connect_link_template.update`, `connect_link_template.delete`). */
    AuditDetailNameTenantId: {
      /**
       * @description Action code identifying this audit entry. One of: `connect_link_template.create`, `connect_link_template.update`, `connect_link_template.delete`. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action:
        | 'connect_link_template.create'
        | 'connect_link_template.update'
        | 'connect_link_template.delete'
      /**
       * @description Name of the affected connect-link template.
       * @example Acme onboarding
       */
      name: string
      /**
       * @description Tenant the template belongs to.
       * @example acme
       */
      tenantId: string
    }
    /** @description Audit detail for changing a connection's sync schedule: the schedule before and after. */
    AuditDetailConnectionSyncSchedule: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'connection.sync_schedule'
      from: components['schemas']['AuditConnectionSyncSchedule']
      to: components['schemas']['AuditConnectionSyncSchedule']
    }
    /** @description A connection's sync schedule. */
    AuditConnectionSyncSchedule: {
      /**
       * @description Sync schedule mode.
       * @example custom
       * @enum {string}
       */
      mode: 'default' | 'custom' | 'trigger_only' | 'once'
      /**
       * @description Minutes between syncs for a `custom` schedule; null otherwise.
       * @example 120
       */
      intervalMinutes: number | null
    }
    /** @description Audit detail for `oauth_issuer.create`. */
    AuditDetailOAuthIssuerCreate: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'oauth_issuer.create'
      /**
       * @description Operator-facing label given to the issuer.
       * @example Corp Keycloak
       */
      name: string
      /**
       * @description The iss value tokens must carry.
       * @example https://idp.corp.example/realms/main
       */
      issuer: string
      /**
       * @description Where tenant and scopes will come from. `external` is the one worth noticing in an audit trail: it means tokens carry their own authority and cannot be revoked before they expire.
       * @example registry
       */
      authorityMode: string
    }
    /** @description Audit detail for `oauth_issuer.update`. */
    AuditDetailOAuthIssuerUpdate: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'oauth_issuer.update'
      /**
       * @description Operator-facing label of the issuer.
       * @example Corp Keycloak
       */
      name: string
      /**
       * @description Which fields the operator submitted. Never the values, and never a token.
       * @example [
       *       "authorityMode",
       *       "allowedTenants"
       *     ]
       */
      changed: string[]
    }
    /** @description Audit detail for `oauth_issuer.delete`. */
    AuditDetailOAuthIssuerDelete: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'oauth_issuer.delete'
      /**
       * @description Label of the deleted issuer.
       * @example Corp Keycloak
       */
      name: string
      /**
       * @description The iss value it accepted.
       * @example https://idp.corp.example/realms/main
       */
      issuer: string
    }
    /** @description Audit detail for `oauth_client.create`. */
    AuditDetailOAuthClientCreate: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'oauth_client.create'
      /**
       * @description Subject claim value identifying the service account.
       * @example billing-service
       */
      subject: string
      /**
       * @description Tenant it authenticates as.
       * @example acme
       */
      tenantId: string
      /**
       * @description Scopes granted to it.
       * @example [
       *       "customers:read",
       *       "vertical:read"
       *     ]
       */
      scopes: string[]
    }
    /** @description Audit detail for `oauth_client.revoke`. */
    AuditDetailOAuthClientRevoke: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'oauth_client.revoke'
      /**
       * @description Subject claim value of the revoked service account.
       * @example billing-service
       */
      subject: string
    }
    /** @description Audit detail for `api_key.rotate`. */
    AuditDetailApiKeyRotate: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'api_key.rotate'
      /**
       * @description Id of the replacement key minted by the rotation.
       * @example a81bc81b-dead-4e5d-abff-90865d1e13b1
       */
      replacementId?: string
      /**
       * @description Epoch ms when the rotated key's grace window ends.
       * @example 1774137600000
       */
      oldKeyRevokeAt?: number
    }
    /** @description Audit detail for a profile picture uploaded to a console account (`targetId` is the account). */
    AuditDetailUserAvatarUpdate: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'user.avatar_update'
      /**
       * @description Image type identified from the uploaded bytes (never the client-declared type).
       * @example image/png
       * @enum {string}
       */
      contentType: 'image/png' | 'image/jpeg' | 'image/webp'
      /**
       * @description Size of the stored picture in bytes.
       * @example 48213
       */
      byteSize: number
    }
    /** @description Audit detail shape shared by 2 actions (`runtime_setting.update`, `runtime_setting.reset`). */
    AuditDetailBeforeAfter: {
      /**
       * @description Action code identifying this audit entry. One of: `runtime_setting.update`, `runtime_setting.reset`. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'runtime_setting.update' | 'runtime_setting.reset'
      /**
       * @description Previous value of the setting before the update; type matches the setting.
       * @example 300
       */
      before: unknown
      /**
       * @description New value of the setting after the update; type matches the setting.
       * @example 600
       */
      after: unknown
    }
    /** @description Audit detail shape shared by 3 actions (`scope_group.create`, `scope_group.update`, `scope_group.delete`). */
    AuditDetailNamePlatform: {
      /**
       * @description Action code identifying this audit entry. One of: `scope_group.create`, `scope_group.update`, `scope_group.delete`. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'scope_group.create' | 'scope_group.update' | 'scope_group.delete'
      /**
       * @description Name of the affected scope group.
       * @example Accounting read
       */
      name: string
      /**
       * @description Platform slug the scope group targets.
       * @example xero
       */
      platform: string
    }
    /** @description Audit detail for `audit.export`. */
    AuditDetailAuditExport: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'audit.export'
      /**
       * @description Export format requested: `csv` or `json`.
       * @example csv
       * @enum {string}
       */
      format: 'csv' | 'json'
      /**
       * @description Number of audit entries included in the export.
       * @example 1042
       */
      count: number
    }
    /** @description Audit detail for `audit.retention.prune`. */
    AuditDetailAuditRetentionPrune: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'audit.retention.prune'
      /**
       * @description Number of audit rows pruned by this retention sweep.
       * @example 128
       */
      deleted: number
      /**
       * @description Retention window in days; rows older than this were deleted.
       * @example 90
       */
      retentionDays: number
    }
    /** @description Audit detail for `logo_fetch.start`. */
    AuditDetailLogoFetchStart: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'logo_fetch.start'
      /**
       * @description Identifier of the queued logo-fetch job.
       * @example lfj_01HQ8ZK
       */
      jobId: string
      /**
       * @description True when the job refetches logos that are already stored.
       * @example false
       */
      force: boolean
      /**
       * @description Vertical the fetch was limited to, or null for every vertical.
       * @example accounting
       */
      vertical: string | null
      /**
       * @description Single platform the fetch was limited to, or null for all of them.
       * @example xero
       */
      slug: string | null
      /**
       * @description Number of platforms the job will consider.
       * @example 1545
       */
      total: number
    }
    /** @description Audit detail for `logo_fetch.cancel`. */
    AuditDetailLogoFetchCancel: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'logo_fetch.cancel'
      /**
       * @description Identifier of the cancelled logo-fetch job.
       * @example lfj_01HQ8ZK
       */
      jobId: string
      /**
       * @description Platforms processed before the cancel was requested.
       * @example 412
       */
      processed: number
    }
    /** @description Audit detail for `logo_fetch.finish`. */
    AuditDetailLogoFetchFinish: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'logo_fetch.finish'
      /**
       * @description Identifier of the finished logo-fetch job.
       * @example lfj_01HQ8ZK
       */
      jobId: string
      /**
       * @description Terminal status: completed, failed, or cancelled.
       * @example completed
       */
      status: string
      /**
       * @description Logos downloaded and stored.
       * @example 1402
       */
      fetched: number
      /**
       * @description Platforms skipped because a logo was already stored.
       * @example 71
       */
      skipped: number
      /**
       * @description Platforms Brandfetch has no logo for.
       * @example 70
       */
      notFound: number
      /**
       * @description Platforms abandoned to Brandfetch rate limiting.
       * @example 2
       */
      throttled: number
      /**
       * @description Wall-clock duration of the job in milliseconds.
       * @example 2410000
       */
      durationMs: number
    }
    /** @description Audit detail for `logo_fetch.purge`. */
    AuditDetailLogoFetchPurge: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'logo_fetch.purge'
      /**
       * @description Number of stored logo rows deleted.
       * @example 1402
       */
      deleted: number
    }
    /** @description Audit detail shape shared by 7 actions (`tenant.create`, `tenant.update`, `role.create`, `role.update`, `dashboard.create`, `dashboard.update`, `dashboard.delete`). */
    AuditDetailName: {
      /**
       * @description Action code identifying this audit entry. One of: `tenant.create`, `tenant.update`, `role.create`, `role.update`, `dashboard.create`, `dashboard.update`, `dashboard.delete`. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action:
        | 'tenant.create'
        | 'tenant.update'
        | 'role.create'
        | 'role.update'
        | 'dashboard.create'
        | 'dashboard.update'
        | 'dashboard.delete'
      /**
       * @description Name of the created tenant.
       * @example Acme Industries
       */
      name: string
    }
    /** @description Audit detail shape shared by 2 actions (`tenant_domain.add`, `tenant_domain.remove`). */
    AuditDetailDomain: {
      /**
       * @description Action code identifying this audit entry. One of: `tenant_domain.add`, `tenant_domain.remove`. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'tenant_domain.add' | 'tenant_domain.remove'
      /**
       * @description Custom domain attached to the tenant.
       * @example dept-a.acme.com
       */
      domain: string
    }
    /** @description Audit detail for clearing tasks on the dashboard. */
    AuditDetailDashboardTaskDismiss: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'dashboard_task.dismiss'
      /**
       * @description Task keys that were cleared.
       * @example [
       *       "conn:expired:conn_1042",
       *       "sync:failed:job_7"
       *     ]
       */
      keys: string[]
      /**
       * @description How many tasks were cleared.
       * @example 2
       */
      count: number
    }
    /** @description Audit detail for `user.role_assign`. */
    AuditDetailUserRoleAssign: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'user.role_assign'
      /**
       * @description Role assigned: a built-in id (`admin`, `operator`, `viewer`) or a custom role id.
       * @example operator
       */
      roleId: string
      /**
       * @description Base role the user now holds for role-level gates.
       * @example operator
       * @enum {string}
       */
      baseRole: 'admin' | 'operator' | 'viewer'
      /**
       * @description True when the change made the user an admin and so lifted their tenant restriction.
       * @example true
       */
      scopeCleared?: boolean
    }
    /** @description Audit detail shape shared by 2 actions (`user.scope_update`, `idp.default_scope.update`). */
    AuditDetailModeTenantIds: {
      /**
       * @description Action code identifying this audit entry. One of: `user.scope_update`, `idp.default_scope.update`. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'user.scope_update' | 'idp.default_scope.update'
      /**
       * @description `all` (every tenant) or `restricted` to the listed tenants.
       * @example restricted
       * @enum {string}
       */
      mode: 'all' | 'restricted'
      /**
       * @description Tenants granted; empty when `mode` is `all`.
       * @example [
       *       "acme"
       *     ]
       */
      tenantIds: string[]
    }
    /** @description Audit detail for revealing the personal data in one stored record. */
    AuditDetailDataPiiReveal: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'data.pii_reveal'
      /**
       * @description Connection whose stored record was revealed.
       * @example 9f8e7d6c-1a2b-4c3d-8e9f-0a1b2c3d4e5f
       */
      connectionId: string
      /**
       * @description Resource type of the record, as stored by the sync worker.
       * @example contacts
       */
      resourceType: string
      /**
       * @description Id of the record whose personal data was shown unmasked.
       * @example cont_jane
       */
      resourceId: string
      /**
       * @description Why the operator needed the unmasked record, as they typed it; null when none was given.
       * @example Support ticket #4821
       */
      reason: string | null
    }
    /** @description Audit detail for an export of stored records. */
    AuditDetailDataExport: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'data.export'
      /**
       * @description Connection whose stored records were exported.
       * @example 9f8e7d6c-1a2b-4c3d-8e9f-0a1b2c3d4e5f
       */
      connectionId: string
      /**
       * @description Resource type exported.
       * @example orders
       */
      resourceType: string
      /**
       * @description Export format: `csv` or `ndjson`.
       * @example csv
       * @enum {string}
       */
      format: 'csv' | 'ndjson'
      /**
       * @description True when the export carried unmasked personal data.
       * @example false
       */
      includePii: boolean
    }
    /** @description Audit detail for `dashboard.share`. */
    AuditDetailDashboardShare: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'dashboard.share'
      /**
       * @description Name of the dashboard.
       * @example Weekly revenue
       */
      name: string
      from: components['schemas']['AuditDashboardAudience']
      to: components['schemas']['AuditDashboardAudience']
      /**
       * @description Pinned tenants before.
       * @example null
       */
      pinnedFrom: string[] | null
      /**
       * @description Pinned tenants after.
       * @example [
       *       "acme"
       *     ]
       */
      pinnedTo: string[] | null
    }
    /** @description Who a dashboard is shared with. */
    AuditDashboardAudience: {
      /**
       * @description Audience kind.
       * @example tenants
       * @enum {string}
       */
      kind: 'private' | 'tenants' | 'everyone'
      /**
       * @description Tenant ids, for `tenants`.
       * @example [
       *       "acme"
       *     ]
       */
      tenants?: string[]
    }
    /** @description Audit detail for a guest token minted to embed a Superset dashboard. */
    AuditDetailSupersetGuestToken: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'superset.guest_token'
      /**
       * @description Title of the embedded Superset dashboard.
       * @example Connection data overview
       */
      title: string
      /**
       * @description True when the token carried a tenant row-level-security clause. Recorded at most once per user and dashboard every 10 minutes.
       * @example false
       */
      restricted: boolean
    }
    /** @description Audit detail for the superset-bootstrap job syncing the dashboard registry. */
    AuditDetailSupersetRegistrySync: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'superset.registry_sync'
      /**
       * @description Dashboards added to the registry.
       * @example 1
       */
      created: number
      /**
       * @description Dashboards updated in place.
       * @example 0
       */
      updated: number
      /**
       * @description Dashboards removed (prune).
       * @example 0
       */
      removed: number
    }
    /** @description Audit detail for `superset.share`. */
    AuditDetailSupersetShare: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'superset.share'
      /**
       * @description Title of the Superset dashboard.
       * @example Revenue
       */
      title: string
      from: components['schemas']['AuditDashboardAudience']
      to: components['schemas']['AuditDashboardAudience']
      /**
       * @description Pinned tenants before.
       * @example null
       */
      pinnedFrom: string[] | null
      /**
       * @description Pinned tenants after.
       * @example [
       *       "acme"
       *     ]
       */
      pinnedTo: string[] | null
    }
    /** @description Audit detail for creating a destination. */
    AuditDetailDestinationCreate: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'destination.create'
      /**
       * @description Id of the destination.
       * @example 5b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b
       */
      destinationId: string
      /**
       * @description Name of the destination.
       * @example Lake (prod)
       */
      name: string
      /**
       * @description Destination type.
       * @example s3
       */
      type: string
      /**
       * @description True when the destination exports personal data unmasked.
       * @example false
       */
      includePii: boolean
      /**
       * @description Owner tenants the destination exports, or `*` for every tenant.
       * @example [
       *       "acme"
       *     ]
       */
      tenants: '*' | string[]
    }
    /** @description Audit detail for changing a destination. */
    AuditDetailDestinationUpdate: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'destination.update'
      /**
       * @description Id of the destination.
       * @example 5b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b
       */
      destinationId: string
      /**
       * @description Name after the update.
       * @example Lake (prod)
       */
      name: string
      /**
       * @description Settings the update changed (`name`, `config`, `scope`, `includePii`, `intervalSec`, `enabled`).
       * @example [
       *       "config",
       *       "intervalSec"
       *     ]
       */
      fields: string[]
      /**
       * @description Whether the destination exports personal data unmasked after the update.
       * @example false
       */
      includePii: boolean
    }
    /** @description Audit detail for deleting a destination. */
    AuditDetailDestinationDelete: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'destination.delete'
      /**
       * @description Id of the destination.
       * @example 5b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b
       */
      destinationId: string
      /**
       * @description Name of the deleted destination; null when it could not be read first.
       * @example Lake (prod)
       */
      name: string | null
    }
    /** @description Audit detail for starting a destination run by hand. */
    AuditDetailDestinationRun: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'destination.run'
      /**
       * @description Id of the destination.
       * @example 5b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b
       */
      destinationId: string
      /**
       * @description Id of the run that was started.
       * @example 0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d
       */
      runId: string
    }
    /** @description Audit detail for a destination backfill. */
    AuditDetailDestinationBackfill: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'destination.backfill'
      /**
       * @description Id of the destination.
       * @example 5b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b
       */
      destinationId: string
      /**
       * @description Vertical whose cursors were reset; null for every vertical.
       * @example crm
       */
      vertical: string | null
      /**
       * @description Resource type whose cursor was reset; null for every type.
       * @example contacts
       */
      resourceType: string | null
      /**
       * @description Cursors reset.
       * @example 3
       */
      cursorsReset: number
      /**
       * @description Run started right away; null when none was started.
       * @example 0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d
       */
      runId: string | null
    }
    /** @description Audit detail for replacing a destination's credentials. */
    AuditDetailDestinationCredentialsRotate: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'destination.credentials_rotate'
      /**
       * @description Id of the destination.
       * @example 5b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b
       */
      destinationId: string
      /**
       * @description Names of the credential fields now set. Values are never recorded.
       * @example [
       *       "accessKeyId",
       *       "secretAccessKey"
       *     ]
       */
      secretFields: string[]
    }
    /** @description Audit detail for testing a destination. */
    AuditDetailDestinationTest: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'destination.test'
      /**
       * @description Id of the destination.
       * @example 5b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b
       */
      destinationId: string
      /**
       * @description Whether the connection test passed.
       * @example true
       */
      ok: boolean
    }
    /** @description Audit detail for provisioning the SQL views. */
    AuditDetailSqlAccessProvision: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'sql_access.provision'
      /**
       * @description Whether anything was (re)created.
       * @example true
       */
      changed: boolean
      /**
       * @description Catalog version now deployed.
       * @example 1
       */
      version: number | null
      /**
       * @description True when a new catalog version was cut for a breaking change.
       * @example false
       */
      breaking: boolean
    }
    /** @description Audit detail for creating a read-only SQL principal. The password is never recorded. */
    AuditDetailSqlAccessPrincipalCreate: {
      /**
       * @description Action code identifying this audit variant. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'sql_access.principal_create'
      /**
       * @description Id of the SQL principal.
       * @example 3f9a1c2b-4d5e-4f60-8a7b-1c2d3e4f5a6b
       */
      principalId: string
      /**
       * @description Postgres login name of the principal.
       * @example os_sql_metabase_prod_3f9a1c
       */
      username: string
      /**
       * @description Label of the principal.
       * @example Metabase prod
       */
      label: string
      /**
       * @description True for an unmasked (PII) principal.
       * @example false
       */
      pii: boolean
      /**
       * @description Tenants the principal sees, or `*`.
       * @example [
       *       "acme"
       *     ]
       */
      tenants: '*' | string[]
      /**
       * @description Verticals the principal sees; `*` or null for all.
       * @example [
       *       "crm"
       *     ]
       */
      verticals: ('*' | string[]) | null
      /**
       * @description When the login expires (ISO 8601); null for never.
       * @example 2027-01-01T00:00:00.000Z
       */
      expiresAt: string | null
    }
    /** @description Audit detail shape shared by 2 actions (`sql_access.principal_rotate`, `sql_access.principal_revoke`). */
    AuditDetailPrincipalIdUsernameSessionsTerminated: {
      /**
       * @description Action code identifying this audit entry. One of: `sql_access.principal_rotate`, `sql_access.principal_revoke`. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      action: 'sql_access.principal_rotate' | 'sql_access.principal_revoke'
      /**
       * @description Id of the SQL principal.
       * @example 3f9a1c2b-4d5e-4f60-8a7b-1c2d3e4f5a6b
       */
      principalId: string
      /**
       * @description Postgres login name of the principal.
       * @example os_sql_metabase_prod_3f9a1c
       */
      username: string
      /**
       * @description Open sessions ended; null when unknown (manual mode).
       * @example 1
       */
      sessionsTerminated: number | null
    }
    /** @description Catalog metadata for an available platform/adapter (name, vertical, auth type). */
    Platform: {
      /**
       * @description Stable machine identifier for the platform/adapter, e.g. `xero`.
       * @example xero
       */
      slug: string
      /**
       * @description Human-readable display name of the platform.
       * @example Xero
       */
      name: string
      /**
       * @description Vertical the platform belongs to, e.g. `accounting`.
       * @example accounting
       */
      vertical: string
      /**
       * @description Authentication scheme the platform uses, e.g. `oauth2`, `api_key`, `basic`.
       * @example oauth2
       */
      authType?: string
      /**
       * @description Catalog category used for grouping in the UI.
       * @example accounting
       */
      category?: string
      /**
       * @description Marketing/landing URL for the platform.
       * @example https://www.xero.com
       */
      website?: string
      unsupported?: components['schemas']['PlatformUnsupported']
    } & {
      [key: string]: unknown
    }
    /** @description Present when a platform is listed and viewable but cannot be enabled or connected. */
    PlatformUnsupported: {
      /**
       * @description Why the platform cannot be connected today.
       * @example OAuth client must be registered inside each customer's own instance.
       */
      reason: string
      /**
       * Format: uri
       * @description Tracking issue for adding support, when one exists.
       * @example https://example.com/issues/123
       */
      issueUrl?: string
    }
    /** @description Per-platform enablement/config status within one vertical, as set by the operator. */
    PlatformOperatorRow: {
      /**
       * @description Platform slug this operator-config row applies to.
       * @example xero
       */
      slug: string
      /**
       * @description Vertical the platform belongs to.
       * @example accounting
       */
      vertical?: string
      /**
       * @description Whether the operator has enabled this platform for the vertical.
       * @example true
       */
      enabled: boolean
      /**
       * @description Whether operator credentials/config have been saved for this platform.
       * @example true
       */
      hasConfig: boolean
      unsupported?: components['schemas']['PlatformUnsupported']
    } & {
      [key: string]: unknown
    }
    /** @description Operator platform configuration with secrets redacted; `hasSecret` flags whether a secret exists. */
    PlatformConfigRedacted: {
      /**
       * @description OAuth client ID configured for the platform; null if unset.
       * @example opensteward
       */
      clientId: string | null
      /**
       * @description OAuth redirect/callback URI configured for the platform; null if unset.
       * @example https://app.acme.example/return
       */
      redirectUri: string | null
      /**
       * @description Scopes the operator has configured to request; null if defaults apply.
       * @example [
       *       "accounting.transactions.read"
       *     ]
       */
      scopes: string[] | null
      /**
       * @description Whether a client secret is stored; the secret itself is never returned.
       * @example true
       */
      hasSecret: boolean
      /**
       * @description Scopes the adapter recommends for this platform; null if none defined.
       * @example [
       *       "accounting.transactions.read"
       *     ]
       */
      recommendedScopes: string[] | null
      /**
       * @description Whether the operator may override the default scope set for this platform.
       * @example true
       */
      supportsScopeOverride?: boolean
    }
    /** @description Stored company/branding info plus audit columns for who last changed it and when. */
    CompanyInfoRecord: {
      /** @example Acme Industries */
      name?: string | null
      /** @example Acme Industries, Inc. */
      legalName?: string | null
      /** @example Industrial supplies and equipment. */
      description?: string | null
      /** @example https://acme.example */
      website?: string | null
      /** @example data:image/svg+xml;base64,PHN2Zz48L3N2Zz4= */
      logoDataUrl?: string | null
      /** @example #1d4ed8 */
      primaryColor?: string | null
      /** @example #0f172a */
      secondaryColor?: string | null
      /** @example Inter, sans-serif */
      fontFamily?: string | null
      /** @example data:font/woff2;base64,d09GMgABAAAAAA== */
      fontDataUrl?: string | null
      /** @example https://fonts.acme.example/inter.css */
      fontUrl?: string | null
      /** @example data:image/png;base64,iVBORw0KGgo= */
      faviconDataUrl?: string | null
      /** @example false */
      hideAttribution?: boolean | null
      /** @example jane.doe@acme.example */
      supportEmail?: string | null
      /** @example https://acme.example/privacy */
      privacyPolicyUrl?: string | null
      /** @example https://acme.example/terms */
      termsOfServiceUrl?: string | null
      /** @example 2500 Market Street */
      addressLine1?: string | null
      /** @example Suite 300 */
      addressLine2?: string | null
      /** @example San Francisco */
      city?: string | null
      /** @example CA */
      region?: string | null
      /** @example 94114 */
      postalCode?: string | null
      /** @example US */
      country?: string | null
      /** @example https://acme.example */
      baseUrl?: string | null
      /**
       * Format: date-time
       * @description When the company info was last modified (ISO 8601).
       * @example 2026-02-01T14:20:00Z
       */
      updatedAt: string
      /**
       * @description Admin user who last modified the company info (prefix `usr_`).
       * @example usr_olivia
       */
      updatedBy: string
    }
    /** @description Public, non-sensitive company branding (logo, colors, fonts, support links) for customer-facing pages. */
    PublicCompanyInfo: {
      /**
       * @description Company display name shown on public pages; null if unset.
       * @example Northwind Traders
       */
      name: string | null
      /**
       * @description Inline data-URL of the company logo; null if unset.
       * @example data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=
       */
      logoDataUrl: string | null
      /**
       * @description Primary brand color (CSS hex); null if unset.
       * @example #1d4ed8
       */
      primaryColor: string | null
      /**
       * @description Secondary brand color (CSS hex); null if unset.
       * @example #0f172a
       */
      secondaryColor: string | null
      /**
       * @description CSS font-family stack for branded pages; null if unset.
       * @example Inter, sans-serif
       */
      fontFamily: string | null
      /**
       * @description Inline data-URL of a custom web font; null if unset.
       * @example data:font/woff2;base64,d09GMgABAAAAAA==
       */
      fontDataUrl: string | null
      /**
       * @description External stylesheet URL for the brand font; null if unset.
       * @example https://fonts.acme.example/inter.css
       */
      fontUrl: string | null
      /**
       * @description Inline data-URL of the favicon; null if unset.
       * @example data:image/png;base64,iVBORw0KGgo=
       */
      faviconDataUrl: string | null
      /**
       * @description When true, the platform "powered by" attribution is hidden on public pages.
       * @example false
       */
      hideAttribution: boolean
      /**
       * @description Support contact email shown to customers; null if unset.
       * @example support@northwind.example
       */
      supportEmail: string | null
      /**
       * @description Link to the company privacy policy; null if unset.
       * @example https://acme.example/privacy
       */
      privacyPolicyUrl: string | null
      /**
       * @description Link to the company terms of service; null if unset.
       * @example https://acme.example/terms
       */
      termsOfServiceUrl: string | null
      /**
       * @description Public base URL of the branded application; null if unset.
       * @example https://acme.example
       */
      baseUrl: string | null
    }
    /** @description An end-user (the operator's customer) in summary form, without PII or related records. */
    EndUserSummary: {
      /**
       * @description Identifier of the end-user (prefix `cus_`).
       * @example cus_4Qm2Xa9Lr
       */
      id: string
      /**
       * @description Tenant (operator customer) the end-user belongs to.
       * @example acme
       */
      tenantId: string
      /**
       * @description Primary email address of the end-user.
       * @example jane.doe@acme.example
       */
      email: string
      /**
       * @description Friendly display name; null if not set.
       * @example Jane Doe
       */
      displayName?: string | null
      /**
       * @description Operator's own identifier for this end-user in their system; null if unset.
       * @example acme-industries
       */
      externalReference?: string | null
      /**
       * Format: date-time
       * @description When the end-user record was created (ISO 8601).
       * @example 2026-01-15T09:30:00Z
       */
      createdAt: string
      /**
       * Format: date-time
       * @description When the end-user record was last modified (ISO 8601).
       * @example 2026-02-01T14:20:00Z
       */
      updatedAt: string
    } & {
      [key: string]: unknown
    }
    /** @description Full end-user record including optional PII, connect sessions, and connections. */
    EndUserDetail: {
      /**
       * @description Identifier of the end-user (prefix `cus_`).
       * @example cus_4Qm2Xa9Lr
       */
      id: string
      /**
       * @description Tenant (operator customer) the end-user belongs to.
       * @example acme
       */
      tenantId: string
      /**
       * @description Primary email address of the end-user.
       * @example jane.doe@acme.example
       */
      email: string
      /**
       * @description Friendly display name; null if not set.
       * @example Jane Doe
       */
      displayName?: string | null
      /**
       * @description Operator's own identifier for this end-user; null if unset.
       * @example acme-industries
       */
      externalReference?: string | null
      /**
       * Format: date-time
       * @description When the end-user record was created (ISO 8601).
       * @example 2026-01-15T09:30:00Z
       */
      createdAt: string
      /**
       * Format: date-time
       * @description When the end-user record was last modified (ISO 8601).
       * @example 2026-02-01T14:20:00Z
       */
      updatedAt: string
      /** @description PII for the end-user; present only when requested and available. */
      pii?: components['schemas']['EndUserPiiOutput'] | null
      /** @description The end-user's connect sessions. */
      sessions?: components['schemas']['ConnectSession'][]
      /** @description The end-user's active platform connections. */
      connections?: ({
        /**
         * @description Identifier of the connection (prefix `conn_`).
         * @example conn_1042
         */
        id: string
        /**
         * @description Vertical of the connected platform; null if unknown.
         * @example accounting
         */
        vertical?: string | null
        /**
         * @description Slug of the connected platform.
         * @example xero
         */
        platform: string
        /**
         * Format: date-time
         * @description When the connection was established (ISO 8601).
         * @example 2026-01-15T09:30:00Z
         */
        createdAt: string
      } & {
        [key: string]: unknown
      })[]
    } & {
      [key: string]: unknown
    }
    /** @description A connect session: a shareable, time-limited link through which an end-user connects a platform. */
    ConnectSession: {
      /**
       * @description Identifier of the connect session (prefix `cs_`).
       * @example cs_8f3a2b9c4d
       */
      id: string
      /**
       * @description Public link token embedded in the shareable connect URL (prefix `cl_`).
       * @example cl_8f3a2b9c4d
       */
      token: string
      /**
       * @description Tenant (operator customer) the session belongs to.
       * @example acme
       */
      tenantId: string
      /**
       * @description End-user this session is bound to; null for self-register links not yet claimed.
       * @example cus_4Qm2Xa9Lr
       */
      endUserId: string | null
      /**
       * @description Human-friendly label for the session, shown in the admin UI.
       * @example Acme onboarding
       */
      label: string
      /**
       * @description Verticals the customer may connect within this session.
       * @example [
       *       "accounting"
       *     ]
       */
      allowedVerticals: string[]
      /**
       * @description Specific platforms the customer may connect within this session.
       * @example [
       *       {
       *         "vertical": "accounting",
       *         "slug": "xero"
       *       }
       *     ]
       */
      allowedPlatforms: components['schemas']['AllowedPlatformOutput'][]
      /**
       * @description URL the customer returns to after connecting; null to use the default.
       * @example https://app.acme.example/return
       */
      redirectUrl: string | null
      /**
       * Format: date-time
       * @description When the connect link expires and can no longer be used (ISO 8601).
       * @example 2026-02-08T09:30:00Z
       */
      expiresAt: string
      /**
       * @description When the link was consumed by a successful connection; null while still active.
       * @example null
       */
      consumedAt: string | null
      /**
       * @description Connection created when the session was completed; null if not yet connected.
       * @example conn_1042
       */
      connectionId: string | null
      /**
       * Format: date-time
       * @description When the session was created (ISO 8601).
       * @example 2026-01-15T09:30:00Z
       */
      createdAt: string
      /**
       * @description Admin user who created the session; null if system-generated.
       * @example usr_olivia
       */
      createdBy: string | null
      /**
       * @description Lifecycle state: `active`, `consumed`, or `expired`.
       * @example active
       */
      status: components['schemas']['ConnectSessionStatus']
      /**
       * @description When true, the link is consumed after a single successful connection.
       * @example false
       */
      oneTimeOnly?: boolean
      /**
       * @description Full shareable connect URL the customer opens to start connecting.
       * @example https://connect.northwind.example/cl_8f3a2b9c4d
       */
      url?: string
    } & {
      [key: string]: unknown
    }
    /** @description A tenant-scoped API key for authenticating to the public/dev API. The secret is shown only at mint time. */
    ApiKey: {
      /**
       * @description Identifier of the API key record (prefix `key_`).
       * @example key_1042
       */
      id: string
      /**
       * @description Tenant (operator customer) the key authenticates as.
       * @example acme
       */
      tenantId: string
      /**
       * @description Public, non-secret key prefix shown in listings; the full secret is returned only once, at creation.
       * @example osk_acme_8f3a
       */
      prefix: string
      /**
       * @description Human-friendly label for the key; null if unlabeled.
       * @example Production key
       */
      label: string | null
      /**
       * @description Permission scopes granted to this key.
       * @example [
       *       "customers:read",
       *       "connections:read"
       *     ]
       */
      scopes: string[]
      /**
       * @description Which surface the key addresses. `live` keys authenticate `/v1/*`; `test` keys authenticate the `/test/v1/*` sandbox. A key without a recorded mode reads as `live`.
       * @example live
       * @enum {string}
       */
      mode: 'live' | 'test'
      /**
       * Format: date-time
       * @description When the key was created (ISO 8601).
       * @example 2026-01-15T09:30:00Z
       */
      createdAt: string
      /**
       * @description When the key was last used to authenticate a request; null if never used.
       * @example 2026-02-01T14:20:00Z
       */
      lastUsedAt: string | null
      /**
       * @description When the key was revoked; null while the key is active.
       * @example null
       */
      revokedAt: string | null
      /**
       * @description Hard expiry; past it the key no longer authenticates. Null = never expires.
       * @example null
       */
      expiresAt?: string | null
      /**
       * @description Scheduled revocation from a rotation grace window; the key keeps working until then. Null unless the key has been rotated.
       * @example null
       */
      revokeAt?: string | null
      /**
       * @description Id of the key this one replaced, when minted by a rotation.
       * @example null
       */
      rotatedFrom?: string | null
    } & {
      [key: string]: unknown
    }
    /** @description API key with the plaintext value (returned once at mint time). */
    ApiKeyMint: {
      /**
       * @description Identifier of the API key record (prefix `key_`).
       * @example key_1042
       */
      id: string
      /**
       * @description Tenant (operator customer) the key authenticates as.
       * @example acme
       */
      tenantId: string
      /**
       * @description Public, non-secret key prefix shown in listings; the full secret is returned only once, at creation.
       * @example osk_acme_8f3a
       */
      prefix: string
      /**
       * @description Human-friendly label for the key; null if unlabeled.
       * @example Production key
       */
      label: string | null
      /**
       * @description Permission scopes granted to this key.
       * @example [
       *       "customers:read",
       *       "connections:read"
       *     ]
       */
      scopes: string[]
      /**
       * @description Which surface the key addresses. `live` keys authenticate `/v1/*`; `test` keys authenticate the `/test/v1/*` sandbox. A key without a recorded mode reads as `live`.
       * @example live
       * @enum {string}
       */
      mode: 'live' | 'test'
      /**
       * Format: date-time
       * @description When the key was created (ISO 8601).
       * @example 2026-01-15T09:30:00Z
       */
      createdAt: string
      /**
       * @description When the key was last used to authenticate a request; null if never used.
       * @example 2026-02-01T14:20:00Z
       */
      lastUsedAt: string | null
      /**
       * @description When the key was revoked; null while the key is active.
       * @example null
       */
      revokedAt: string | null
      /**
       * @description Hard expiry; past it the key no longer authenticates. Null = never expires.
       * @example null
       */
      expiresAt?: string | null
      /**
       * @description Scheduled revocation from a rotation grace window; the key keeps working until then. Null unless the key has been rotated.
       * @example null
       */
      revokeAt?: string | null
      /**
       * @description Id of the key this one replaced, when minted by a rotation.
       * @example null
       */
      rotatedFrom?: string | null
      /**
       * @description The full plaintext API key; shown only once at mint time and never retrievable again.
       * @example osk_acme_8f3a2b9c4d5e6f7a8b9c0d1e
       */
      plaintext: string
    } & {
      [key: string]: unknown
    }
    /** @description The replacement key minted by a rotation (plaintext returned once) plus when the old key dies. */
    ApiKeyRotate: {
      /**
       * @description Identifier of the API key record (prefix `key_`).
       * @example key_1042
       */
      id: string
      /**
       * @description Tenant (operator customer) the key authenticates as.
       * @example acme
       */
      tenantId: string
      /**
       * @description Public, non-secret key prefix shown in listings; the full secret is returned only once, at creation.
       * @example osk_acme_8f3a
       */
      prefix: string
      /**
       * @description Human-friendly label for the key; null if unlabeled.
       * @example Production key
       */
      label: string | null
      /**
       * @description Permission scopes granted to this key.
       * @example [
       *       "customers:read",
       *       "connections:read"
       *     ]
       */
      scopes: string[]
      /**
       * @description Which surface the key addresses. `live` keys authenticate `/v1/*`; `test` keys authenticate the `/test/v1/*` sandbox. A key without a recorded mode reads as `live`.
       * @example live
       * @enum {string}
       */
      mode: 'live' | 'test'
      /**
       * Format: date-time
       * @description When the key was created (ISO 8601).
       * @example 2026-01-15T09:30:00Z
       */
      createdAt: string
      /**
       * @description When the key was last used to authenticate a request; null if never used.
       * @example 2026-02-01T14:20:00Z
       */
      lastUsedAt: string | null
      /**
       * @description When the key was revoked; null while the key is active.
       * @example null
       */
      revokedAt: string | null
      /**
       * @description Hard expiry; past it the key no longer authenticates. Null = never expires.
       * @example null
       */
      expiresAt?: string | null
      /**
       * @description Scheduled revocation from a rotation grace window; the key keeps working until then. Null unless the key has been rotated.
       * @example null
       */
      revokeAt?: string | null
      /**
       * @description Id of the key this one replaced, when minted by a rotation.
       * @example null
       */
      rotatedFrom?: string | null
      /**
       * @description The full plaintext API key; shown only once at mint time and never retrievable again.
       * @example osk_acme_8f3a2b9c4d5e6f7a8b9c0d1e
       */
      plaintext: string
      /**
       * @description Epoch ms when the replaced key stops verifying — the end of the rotation grace window in which both keys work.
       * @example 1774137600000
       */
      oldKeyRevokeAt: number
    } & {
      [key: string]: unknown
    }
    /** @description An identity provider whose tokens the developer API accepts. */
    OAuthIssuer: {
      /**
       * @description Identifier of the issuer record.
       * @example a3f1…
       */
      id: string
      /**
       * @description Operator-facing label.
       * @example Corp Keycloak
       */
      name: string
      /**
       * @description Vendor preset the claim names were seeded from, or `generic`.
       * @example keycloak
       */
      preset: string
      /**
       * @description The exact `iss` value tokens must carry.
       * @example https://idp.corp.example/realms/main
       */
      issuer: string
      /**
       * @description Where the issuer publishes its signing keys; resolved from its discovery document.
       * @example https://idp.corp.example/realms/main/protocol/openid-connect/certs
       */
      jwksUri: string
      /**
       * @description The exact `aud` value tokens must carry. Never blank — without it every token the issuer ever minted would be accepted.
       * @example https://opensteward.corp.internal
       */
      audience: string
      /**
       * @description Which claim names the calling client.
       * @example azp
       */
      subjectClaim: string
      /**
       * @description Which claim carries the token scopes. Dotted paths are read.
       * @example realm_access.roles
       */
      scopeClaim: string
      /**
       * @description Signature algorithms accepted. Asymmetric only.
       * @example [
       *       "RS256",
       *       "ES256"
       *     ]
       */
      algorithms: string[]
      /**
       * @description Where tenant and scopes come from. `registry`: the client row decides, and deleting it cuts off a live token. `intersect`: the row is the ceiling and the token may narrow it. `external`: the token decides both, and nothing can revoke it before it expires.
       * @example registry
       * @enum {string}
       */
      authorityMode: 'registry' | 'intersect' | 'external'
      /**
       * @description External mode only: which claim names the tenant. Null otherwise.
       * @example https://opensteward/tenant
       */
      tenantClaim: string | null
      /**
       * @description External mode only: tenant values this issuer may assert. Empty admits nobody, never everybody.
       * @example [
       *       "acme"
       *     ]
       */
      allowedTenants: string[]
      /**
       * @description External mode only: refuse a token whose `exp - iat` exceeds this. The only lever over a credential nothing can revoke.
       * @example 3600
       */
      maxTokenLifetimeS: number
      /**
       * @description Whether tokens from it are accepted.
       * @example true
       */
      enabled: boolean
      /**
       * @description When a real token from this issuer last verified. Null means it has never admitted anybody, which is what blocks disabling API keys.
       * @example 2026-08-29T10:00:00Z
       */
      lastVerifiedAt: string | null
      /**
       * Format: date-time
       * @description When the issuer was registered.
       * @example 2026-08-01T09:00:00Z
       */
      createdAt: string
      /**
       * Format: date-time
       * @description When it was last changed.
       * @example 2026-08-20T09:00:00Z
       */
      updatedAt: string
    }
    /** @description Whether OIDC bearer auth is usable. Checked before allowing an operator to disable API keys, so that switch cannot lock every developer out. */
    OAuthReadiness: {
      /**
       * @description Whether an OIDC token could actually admit somebody right now.
       * @example true
       */
      ready: boolean
      /**
       * @description Why, in words — shown to the operator when disabling API keys is refused.
       * @example Corp Keycloak is configured and has verified a token.
       */
      reason: string
    }
    /** @description Claim-name defaults for a known identity provider. */
    OAuthPreset: {
      /**
       * @description Preset identifier.
       * @example keycloak
       */
      id: string
      /**
       * @description Vendor name.
       * @example Keycloak
       */
      label: string
      /**
       * @description Shape of that vendor's issuer URL.
       * @example https://{host}/realms/{realm}
       */
      issuerHint: string
      /**
       * @description Default subject claim for this vendor.
       * @example azp
       */
      subjectClaim: string
      /**
       * @description Default scope claim for this vendor.
       * @example realm_access.roles
       */
      scopeClaim: string
      /**
       * @description Vendor-specific caveat worth reading before saving.
       * @example A v1.0 token carries iss=https://sts.windows.net/{tenantId}/ even when the v2.0 endpoint is configured, and will be rejected.
       */
      note?: string
    }
    /** @description One issuer with its clients and scope rules. */
    OAuthIssuerDetail: {
      issuer: components['schemas']['OAuthIssuer']
      /** @description Service accounts registered against it. */
      clients: components['schemas']['OAuthClient'][]
      /** @description Scope mapping rules, ascending priority. */
      rules: components['schemas']['OAuthScopeRule'][]
    }
    /** @description A registered service account authenticating with OIDC tokens. */
    OAuthClient: {
      /**
       * @description Identifier of the client record.
       * @example c7b2…
       */
      id: string
      /**
       * @description Issuer this client belongs to.
       * @example a3f1…
       */
      issuerId: string
      /**
       * @description Value of the issuer's subject claim identifying this client.
       * @example billing-service
       */
      subject: string
      /**
       * @description Tenant the client authenticates as.
       * @example acme
       */
      tenantId: string
      /**
       * @description Human-friendly label.
       * @example Billing service
       */
      label: string | null
      /**
       * @description Scopes granted — the same vocabulary developer API keys use.
       * @example [
       *       "customers:read",
       *       "vertical:read"
       *     ]
       */
      scopes: string[]
      /**
       * Format: date-time
       * @description When it was registered.
       * @example 2026-08-01T09:00:00Z
       */
      createdAt: string
      /**
       * @description When a token from it last verified.
       * @example 2026-08-29T10:00:00Z
       */
      lastUsedAt: string | null
      /**
       * @description When it was revoked. A revoked client stops working immediately, mid-token.
       * @example null
       */
      revokedAt: string | null
    }
    /** @description Maps the IdP's scope vocabulary onto OpenSteward's. With no rules the claim passes through verbatim; with rules, an unmapped value is dropped. */
    OAuthScopeRule: {
      /**
       * @description Identifier of the rule.
       * @example r5c9…
       */
      id: string
      /**
       * @description Issuer the rule belongs to.
       * @example a3f1…
       */
      issuerId: string
      /**
       * @description Evaluation order, ascending.
       * @example 0
       */
      priority: number
      /**
       * @description A value as it appears in the token's scope claim.
       * @example read:ledger
       */
      claimValue: string
      /**
       * @description The OpenSteward scope it grants.
       * @example vertical:accounting
       */
      grantedScope: string
    }
    /** @description Result of reading an issuer's OpenID discovery document. */
    OAuthDiscovery: {
      /**
       * @description The issuer the document reports.
       * @example https://idp.corp.example/realms/main
       */
      issuer: string
      /**
       * @description Where its signing keys are published.
       * @example https://idp.corp.example/realms/main/protocol/openid-connect/certs
       */
      jwksUri: string
    }
    /** @description An API token scoped to a single end-user, letting them act on their own connections. */
    EndUserToken: {
      /**
       * @description Identifier of the end-user token record (prefix `eut_`).
       * @example eut_1042
       */
      id: string
      /**
       * @description End-user this token authenticates as (prefix `cus_`).
       * @example cus_4Qm2Xa9Lr
       */
      endUserId: string
      /**
       * @description Tenant the end-user belongs to.
       * @example acme
       */
      tenantId: string
      /**
       * @description Public, non-secret token prefix shown in listings; the full secret is returned only once, at creation.
       * @example osk_acme_8f3a
       */
      prefix: string
      /**
       * @description Human-friendly label for the token; null if unlabeled.
       * @example Production key
       */
      label: string | null
      /**
       * @description Permission scopes granted to this token.
       * @example [
       *       "customers:read",
       *       "connections:read"
       *     ]
       */
      scopes: string[]
      /**
       * Format: date-time
       * @description When the token was created (ISO 8601).
       * @example 2026-01-15T09:30:00Z
       */
      createdAt: string
      /**
       * @description Admin user who minted the token; null if system-generated.
       * @example usr_olivia
       */
      createdBy: string | null
      /**
       * @description When the token was last used to authenticate a request; null if never used.
       * @example 2026-02-01T14:20:00Z
       */
      lastUsedAt: string | null
      /**
       * @description When the token was revoked; null while the token is active.
       * @example null
       */
      revokedAt: string | null
    } & {
      [key: string]: unknown
    }
    /** @description End-user token with the plaintext value (returned once at mint time). */
    EndUserTokenMint: {
      /**
       * @description Identifier of the end-user token record (prefix `eut_`).
       * @example eut_1042
       */
      id: string
      /**
       * @description End-user this token authenticates as (prefix `cus_`).
       * @example cus_4Qm2Xa9Lr
       */
      endUserId: string
      /**
       * @description Tenant the end-user belongs to.
       * @example acme
       */
      tenantId: string
      /**
       * @description Public, non-secret token prefix shown in listings; the full secret is returned only once, at creation.
       * @example osk_acme_8f3a
       */
      prefix: string
      /**
       * @description Human-friendly label for the token; null if unlabeled.
       * @example Production key
       */
      label: string | null
      /**
       * @description Permission scopes granted to this token.
       * @example [
       *       "customers:read",
       *       "connections:read"
       *     ]
       */
      scopes: string[]
      /**
       * Format: date-time
       * @description When the token was created (ISO 8601).
       * @example 2026-01-15T09:30:00Z
       */
      createdAt: string
      /**
       * @description Admin user who minted the token; null if system-generated.
       * @example usr_olivia
       */
      createdBy: string | null
      /**
       * @description When the token was last used to authenticate a request; null if never used.
       * @example 2026-02-01T14:20:00Z
       */
      lastUsedAt: string | null
      /**
       * @description When the token was revoked; null while the token is active.
       * @example null
       */
      revokedAt: string | null
      /**
       * @description The full plaintext token; shown only once at mint time and never retrievable again.
       * @example osk_acme_8f3a2b9c4d5e6f7a8b9c0d1e
       */
      plaintext: string
    } & {
      [key: string]: unknown
    }
    /** @description A tenant webhook subscription that receives event deliveries at an HTTPS endpoint. */
    WebhookSubscription: {
      /**
       * @description Identifier of the webhook subscription (prefix `whs_`).
       * @example whs_1042
       */
      id: string
      /**
       * @description Tenant (operator customer) that owns the subscription.
       * @example acme
       */
      tenantId: string
      /**
       * @description HTTPS endpoint that receives event deliveries.
       * @example https://hooks.acme.example/opensteward
       */
      url: string
      /**
       * @description Human-friendly name for the subscription, or null when it has none. Purely descriptive — nothing routes on it — and what the admin list searches.
       * @example Billing service
       */
      label?: string | null
      /**
       * @description Event types this subscription is subscribed to, e.g. `customer.created`.
       * @example [
       *       "customer.created"
       *     ]
       */
      events: string[]
      /**
       * @description Whether deliveries are suspended. A paused subscription is retained and still accepts a test send, but receives no event deliveries. Toggle with `POST /api/webhook-subscriptions/{id}/paused`.
       * @example false
       */
      paused?: boolean
      /**
       * Format: date-time
       * @description When the subscription was created (ISO 8601).
       * @example 2026-01-15T09:30:00Z
       */
      createdAt: string
      /**
       * @description When an event was last delivered to this endpoint; null if never fired.
       * @example 2026-02-01T14:20:00Z
       */
      lastFiredAt?: string | null
      /**
       * @description HTTP status code of the most recent delivery attempt; null if never fired.
       * @example 200
       */
      lastStatus?: number | null
      /**
       * @description Error from the most recent failed delivery; null if the last attempt succeeded.
       * @example null
       */
      lastError?: string | null
      /**
       * @description Payload shape sent to this endpoint. `opensteward` is the signed event envelope; `slack` renders Slack blocks; `teams` renders an Adaptive Card for a Teams Workflows URL; `flat` is a one-level object with dotted keys.
       * @example opensteward
       * @enum {string}
       */
      format: 'opensteward' | 'slack' | 'teams' | 'flat'
      /**
       * @description Names of the custom headers sent with each delivery. Values are stored encrypted and are never returned by the API.
       * @example [
       *       "X-Api-Key"
       *     ]
       */
      headerNames: string[]
    } & {
      [key: string]: unknown
    }
    /** @description Webhook subscription with the plaintext shared secret (returned once at create time). */
    WebhookSubscriptionWithSecret: {
      /**
       * @description Identifier of the webhook subscription (prefix `whs_`).
       * @example whs_1042
       */
      id: string
      /**
       * @description Tenant (operator customer) that owns the subscription.
       * @example acme
       */
      tenantId: string
      /**
       * @description HTTPS endpoint that receives event deliveries.
       * @example https://hooks.acme.example/opensteward
       */
      url: string
      /**
       * @description Human-friendly name for the subscription, or null when it has none. Purely descriptive — nothing routes on it — and what the admin list searches.
       * @example Billing service
       */
      label?: string | null
      /**
       * @description Event types this subscription is subscribed to, e.g. `customer.created`.
       * @example [
       *       "customer.created"
       *     ]
       */
      events: string[]
      /**
       * @description Whether deliveries are suspended. A paused subscription is retained and still accepts a test send, but receives no event deliveries. Toggle with `POST /api/webhook-subscriptions/{id}/paused`.
       * @example false
       */
      paused?: boolean
      /**
       * Format: date-time
       * @description When the subscription was created (ISO 8601).
       * @example 2026-01-15T09:30:00Z
       */
      createdAt: string
      /**
       * @description When an event was last delivered to this endpoint; null if never fired.
       * @example 2026-02-01T14:20:00Z
       */
      lastFiredAt?: string | null
      /**
       * @description HTTP status code of the most recent delivery attempt; null if never fired.
       * @example 200
       */
      lastStatus?: number | null
      /**
       * @description Error from the most recent failed delivery; null if the last attempt succeeded.
       * @example null
       */
      lastError?: string | null
      /**
       * @description Payload shape sent to this endpoint. `opensteward` is the signed event envelope; `slack` renders Slack blocks; `teams` renders an Adaptive Card for a Teams Workflows URL; `flat` is a one-level object with dotted keys.
       * @example opensteward
       * @enum {string}
       */
      format: 'opensteward' | 'slack' | 'teams' | 'flat'
      /**
       * @description Names of the custom headers sent with each delivery. Values are stored encrypted and are never returned by the API.
       * @example [
       *       "X-Api-Key"
       *     ]
       */
      headerNames: string[]
      /**
       * @description Shared signing secret used to verify delivery signatures; returned only once at create time.
       * @example whsec_8f3a2b9c4d5e6f7a8b9c0d1e
       */
      secret: string
    } & {
      [key: string]: unknown
    }
    /** @description Outcome of sending one synthetic test event to a webhook subscription. */
    WebhookTestResult: {
      /**
       * @description Subscription the test was sent to.
       * @example whs_1042
       */
      id: string
      /**
       * @description True when the receiver answered 2xx. False means the destination rejected or could not be reached — the answer to the diagnostic, not an API error.
       * @example true
       */
      ok: boolean
      /**
       * @description HTTP status the receiver returned, or null when the request never completed.
       * @example 200
       */
      status: number | null
      /**
       * @description Format the test payload was rendered in.
       * @example slack
       * @enum {string}
       */
      format: 'opensteward' | 'slack' | 'teams' | 'flat'
      /**
       * @description The exact bytes sent, so the payload can be inspected. Synthetic and carries no secret.
       * @example {"text":"Test event from OpenSteward"}
       */
      sentBody?: string
      /**
       * @description Why the request never completed, when it did not (DNS failure, timeout, blocked address).
       * @example getaddrinfo ENOTFOUND hooks.example
       */
      error?: string
    } & {
      [key: string]: unknown
    }
    /** @description A single webhook delivery attempt for one event to one subscription, with retry state. */
    WebhookDelivery: {
      /**
       * @description Identifier of the delivery attempt record (prefix `whd_`).
       * @example whd_1042
       */
      id: string
      /**
       * @description Subscription this delivery belongs to (prefix `whs_`).
       * @example whs_1042
       */
      subscriptionId: string
      /**
       * @description Identifier of the source event being delivered (prefix `evt_`).
       * @example evt_4Qm2Xa9Lr
       */
      eventId: string
      /**
       * @description Type of the event being delivered, e.g. `customer.created`.
       * @example customer.created
       */
      eventType: string
      /**
       * @description Destination endpoint the event was delivered to.
       * @example https://hooks.acme.example/opensteward
       */
      url: string
      /**
       * @description Delivery state: `pending` (will retry), `delivered`, or `dead` (gave up).
       * @example delivered
       */
      status: components['schemas']['WebhookDeliveryStatus']
      /**
       * @description Number of delivery attempts made so far.
       * @example 1
       */
      attempts: number
      /**
       * Format: date-time
       * @description When the next delivery retry is scheduled (for pending/failed deliveries).
       * @example 2026-02-01T14:25:00Z
       */
      nextAttemptAt: string
      /**
       * @description When the event was successfully delivered; null if not yet delivered.
       * @example 2026-02-01T14:20:00Z
       */
      deliveredAt: string | null
      /**
       * @description HTTP status code returned by the most recent attempt; null if not yet attempted.
       * @example 200
       */
      lastStatus: number | null
      /**
       * @description Error message from the most recent failed attempt; null on success.
       * @example null
       */
      lastError: string | null
      /**
       * Format: date-time
       * @description When this delivery record was created (ISO 8601).
       * @example 2026-01-15T09:30:00Z
       */
      createdAt: string
    } & {
      [key: string]: unknown
    }
    /** @enum {string} */
    WebhookDeliveryStatus: 'pending' | 'delivered' | 'dead'
    /** @description A background data-sync job for one connection, with per-resource progress and lifecycle timestamps. */
    SyncJob: {
      /**
       * @description Identifier of the sync job (prefix `job_`).
       * @example job_1042
       */
      id: string
      /**
       * @description Vertical the sync runs against.
       * @example accounting
       */
      vertical: string
      /**
       * @description Connection whose data is being synced (prefix `conn_`).
       * @example conn_1042
       */
      connectionId: string
      /**
       * @description Slug of the platform being synced.
       * @example xero
       */
      platform: string
      /**
       * @description Tenant that owns the connection; null for jobs on connections not scoped to a tenant.
       * @example acme
       */
      tenantId?: string | null
      /**
       * @description Job lifecycle state: `pending`, `running`, `completed`, or `failed`.
       * @example completed
       */
      status: components['schemas']['SyncJobStatus']
      /**
       * @description Per-resource progress keyed by resource name (e.g. `transactions`); null before the job starts.
       * @example {
       *       "transactions": {
       *         "synced": 128,
       *         "status": "completed"
       *       }
       *     }
       */
      progress?: {
        [key: string]: {
          /**
           * @description Number of records synced for this resource so far.
           * @example 128
           */
          synced: number
          /**
           * @description Per-resource sync status.
           * @example completed
           */
          status: string
          /**
           * @description Error encountered syncing this resource, if any.
           * @example rate limited
           */
          error?: string
        } & {
          [key: string]: unknown
        }
      } | null
      /**
       * @description Top-level failure reason; null unless the job failed.
       * @example null
       */
      error?: string | null
      /**
       * @description URL notified when the job completes; null if no callback was requested.
       * @example https://app.acme.example/sync-callback
       */
      callbackUrl?: string | null
      /**
       * @description When the job was created/enqueued (ISO 8601).
       * @example 2026-01-15T09:30:00.000Z
       */
      createdAt: string
      /**
       * @description When the job began running; null while still pending.
       * @example 2026-01-15T09:30:05.000Z
       */
      startedAt?: string | null
      /**
       * @description When the job finished (success or failure); null while still running.
       * @example 2026-01-15T09:31:00.000Z
       */
      completedAt?: string | null
      /**
       * @description Why the job was queued: `manual` (Sync now), `api` (POST /v1/{vertical}/sync), `connect` (after a Connect Link), `boot` (DATA_STORE_AUTO_SYNC_ON_BOOT) or `schedule` (the connection's sync schedule). Null on older jobs.
       * @example schedule
       */
      origin?: ('manual' | 'api' | 'connect' | 'boot' | 'schedule') | null
    } & {
      [key: string]: unknown
    }
    /** @description Operational metrics for the synced-data store: row counts, sync-job counts, and storage size. */
    DataStoreMetrics: {
      /**
       * @description Backing store driver in use, e.g. `sqlite` or `postgres`.
       * @example sqlite
       */
      mode: string
      /**
       * @description Filesystem path or connection target of the data store.
       * @example /var/lib/opensteward/data.db
       */
      path: string
      /** @description Aggregate counts of stored data rows. */
      rows: {
        /**
         * @description Total number of synced data rows across all verticals.
         * @example 1280
         */
        total: number
        /**
         * @description Row counts keyed by vertical.
         * @example {
         *       "accounting": 1280
         *     }
         */
        per_vertical: {
          [key: string]: number
        }
        /**
         * @description Age of the oldest stored row in milliseconds; null if the store is empty.
         * @example 1480200000
         */
        oldest_age_ms: number | null
      } & {
        [key: string]: unknown
      }
      /** @description Sync-job counts by state and vertical. */
      sync_jobs: {
        /**
         * @description Number of sync jobs currently queued but not started.
         * @example 0
         */
        pending: number
        /**
         * @description Number of sync jobs currently executing.
         * @example 1
         */
        running: number
        /**
         * @description Number of jobs that failed in the recent window.
         * @example 0
         */
        failed_recent: number
        /**
         * @description Job counts keyed by vertical, then by status.
         * @example {
         *       "accounting": {
         *         "completed": 12
         *       }
         *     }
         */
        per_vertical: {
          [key: string]: {
            [key: string]: number
          }
        }
      } & {
        [key: string]: unknown
      }
      /**
       * @description On-disk size of the data store in bytes; null if not measurable.
       * @example 2097152
       */
      db_size_bytes: number | null
      /**
       * @description On-disk size of the data store in megabytes; null if not measurable.
       * @example 2
       */
      db_size_mb: number | null
      /**
       * @description When these metrics were sampled (ISO 8601).
       * @example 2026-01-15T09:30:00.000Z
       */
      timestamp: string
    } & {
      [key: string]: unknown
    }
    /** @description A reusable, named bundle of platform scopes that can be attached to connect links. */
    ScopeGroup: {
      /**
       * @description Numeric identifier of the scope group.
       * @example 7
       */
      id: number
      /**
       * @description Vertical the scope group applies to.
       * @example accounting
       */
      vertical: string
      /**
       * @description Platform slug the scope group applies to.
       * @example xero
       */
      platform: string
      /**
       * @description Human-friendly label for the named bundle of scopes.
       * @example Accounting read
       */
      name: string
      /**
       * @description Platform scopes/permissions included in this group.
       * @example [
       *       "accounting.transactions.read"
       *     ]
       */
      scopes: string[]
      /**
       * Format: date-time
       * @description When the scope group was created (ISO 8601).
       * @example 2026-01-15T09:30:00Z
       */
      createdAt: string
    }
    /** @description Connect Link template, keyed by `linkMode`. */
    ConnectLinkTemplate:
      | components['schemas']['ConnectLinkTemplatePinned']
      | components['schemas']['ConnectLinkTemplatePicks']
      | components['schemas']['ConnectLinkTemplateSelfRegister']
    ConnectLinkTemplatePinned: {
      /**
       * @description Numeric identifier of the connect-link template.
       * @example 7
       */
      id: number
      /**
       * @description Tenant (operator customer) that owns this template.
       * @example acme
       */
      tenantId: string
      /**
       * @description Human-friendly name for the template, shown in the admin UI.
       * @example Acme onboarding
       */
      name: string
      /**
       * @description Optional longer description of the template; null if unset.
       * @example Onboarding link for Acme Industries.
       */
      description: string | null
      /**
       * @description Scope group whose scopes are requested by links from this template; null for defaults.
       * @example 7
       */
      scopeGroupId: number | null
      /**
       * @description Number of days a generated connect link remains valid before expiring.
       * @example 7
       */
      expiryDays: number
      /**
       * @description When true, links from this template are consumed after a single successful connection.
       * @example false
       */
      oneTimeOnly: boolean
      /**
       * @description URL the customer is sent to after completing the connection; null to use the default.
       * @example https://app.acme.example/return
       */
      redirectUrl: string | null
      /**
       * Format: date-time
       * @description When the template was created (ISO 8601).
       * @example 2026-01-15T09:30:00Z
       */
      createdAt: string
      /**
       * @description Admin user who created the template; null if created by the system.
       * @example usr_olivia
       */
      createdBy: string | null
      /**
       * @description Pinned mode: the adapter is pre-selected, so the customer connects exactly one platform with no choice. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      linkMode: 'pinned'
      /**
       * @description The single pinned platform the customer will connect.
       * @example [
       *       {
       *         "vertical": "accounting",
       *         "slug": "xero"
       *       }
       *     ]
       */
      allowedPlatforms: components['schemas']['AllowedPlatformOutput'][]
      /**
       * @description Verticals implied by the pinned platform(s).
       * @example [
       *       "accounting"
       *     ]
       */
      allowedVerticals: string[]
    }
    ConnectLinkTemplatePicks: {
      /**
       * @description Numeric identifier of the connect-link template.
       * @example 7
       */
      id: number
      /**
       * @description Tenant (operator customer) that owns this template.
       * @example acme
       */
      tenantId: string
      /**
       * @description Human-friendly name for the template, shown in the admin UI.
       * @example Acme onboarding
       */
      name: string
      /**
       * @description Optional longer description of the template; null if unset.
       * @example Onboarding link for Acme Industries.
       */
      description: string | null
      /**
       * @description Scope group whose scopes are requested by links from this template; null for defaults.
       * @example 7
       */
      scopeGroupId: number | null
      /**
       * @description Number of days a generated connect link remains valid before expiring.
       * @example 7
       */
      expiryDays: number
      /**
       * @description When true, links from this template are consumed after a single successful connection.
       * @example false
       */
      oneTimeOnly: boolean
      /**
       * @description URL the customer is sent to after completing the connection; null to use the default.
       * @example https://app.acme.example/return
       */
      redirectUrl: string | null
      /**
       * Format: date-time
       * @description When the template was created (ISO 8601).
       * @example 2026-01-15T09:30:00Z
       */
      createdAt: string
      /**
       * @description Admin user who created the template; null if created by the system.
       * @example usr_olivia
       */
      createdBy: string | null
      /**
       * @description Picks mode: the customer chooses which of the allowed platforms/verticals to connect. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      linkMode: 'customer-picks-adapter'
      /**
       * @description Platforms the customer may choose from.
       * @example [
       *       {
       *         "vertical": "accounting",
       *         "slug": "xero"
       *       }
       *     ]
       */
      allowedPlatforms: components['schemas']['AllowedPlatformOutput'][]
      /**
       * @description Verticals the customer may choose from.
       * @example [
       *       "accounting"
       *     ]
       */
      allowedVerticals: string[]
    }
    ConnectLinkTemplateSelfRegister: {
      /**
       * @description Numeric identifier of the connect-link template.
       * @example 7
       */
      id: number
      /**
       * @description Tenant (operator customer) that owns this template.
       * @example acme
       */
      tenantId: string
      /**
       * @description Human-friendly name for the template, shown in the admin UI.
       * @example Acme onboarding
       */
      name: string
      /**
       * @description Optional longer description of the template; null if unset.
       * @example Onboarding link for Acme Industries.
       */
      description: string | null
      /**
       * @description Scope group whose scopes are requested by links from this template; null for defaults.
       * @example 7
       */
      scopeGroupId: number | null
      /**
       * @description Number of days a generated connect link remains valid before expiring.
       * @example 7
       */
      expiryDays: number
      /**
       * @description When true, links from this template are consumed after a single successful connection.
       * @example false
       */
      oneTimeOnly: boolean
      /**
       * @description URL the customer is sent to after completing the connection; null to use the default.
       * @example https://app.acme.example/return
       */
      redirectUrl: string | null
      /**
       * Format: date-time
       * @description When the template was created (ISO 8601).
       * @example 2026-01-15T09:30:00Z
       */
      createdAt: string
      /**
       * @description Admin user who created the template; null if created by the system.
       * @example usr_olivia
       */
      createdBy: string | null
      /**
       * @description Self-register mode: the customer self-identifies and connects without a pre-defined platform restriction. (enum property replaced by openapi-typescript)
       * @enum {string}
       */
      linkMode: 'self-register'
      /**
       * @description Optional platform allow-list; empty means any supported platform.
       * @example [
       *       {
       *         "vertical": "accounting",
       *         "slug": "xero"
       *       }
       *     ]
       */
      allowedPlatforms: components['schemas']['AllowedPlatformOutput'][]
      /**
       * @description Optional vertical allow-list; empty means any supported vertical.
       * @example [
       *       "accounting"
       *     ]
       */
      allowedVerticals: string[]
    }
    /** @description One domain→tenant pair from the unauthenticated resolver map. */
    TenantDomainMapEntry: {
      /**
       * @description Custom domain (lower-cased, no scheme).
       * @example dept-a.acme.com
       */
      domain: string
      /**
       * @description Tenant the domain resolves to.
       * @example acme
       */
      tenantId: string
    }
    /** @description A tenant (operator customer / internal department) that data is scoped to. */
    Tenant: {
      /**
       * @description Stable tenant identifier (slug); the value stored on `tenant_id` / `owner_tenant_id` columns.
       * @example acme
       */
      id: string
      /**
       * @description Human-friendly tenant name shown in the admin console.
       * @example Acme Industries
       */
      name: string
      /**
       * Format: date-time
       * @description When the tenant was registered (ISO 8601).
       * @example 2026-01-15T09:30:00Z
       */
      createdAt: string
      /**
       * Format: date-time
       * @description When the tenant was last modified (ISO 8601).
       * @example 2026-02-01T14:20:00Z
       */
      updatedAt: string
    }
    /** @description A custom domain → tenant mapping. Requests arriving on this host resolve to the tenant. */
    TenantDomain: {
      /**
       * @description Custom domain mapped to the tenant; lower-cased, no scheme (e.g. `dept-a.acme.com`).
       * @example dept-a.acme.com
       */
      domain: string
      /**
       * @description Tenant this domain resolves to.
       * @example acme
       */
      tenantId: string
      /**
       * Format: date-time
       * @description When the domain was attached (ISO 8601).
       * @example 2026-01-15T09:30:00Z
       */
      createdAt: string
    }
    /** @description A dashboard task an operator cleared, and the fingerprint it was cleared at. */
    DashboardDismissal: {
      /**
       * @description Task key: `conn:expired:<connectionId>`, `platform:creds:<vertical>/<platform>`, `sync:failed:<jobId>`, `refresh:failing:<connectionId>` or `wizard:<step>`.
       * @example conn:expired:conn_1042
       */
      key: string
      /**
       * @description Fingerprint the task was cleared at (ISO 8601 for timestamps, empty when the key alone identifies the condition). The dashboard hides the task only while its live fingerprint equals this.
       * @example 2026-09-01T00:00:00.000Z
       */
      fingerprint: string
      /**
       * @description Id of the user who cleared the task.
       * @example usr_olivia
       */
      by: string
      /**
       * Format: date-time
       * @description When the task was cleared (ISO 8601).
       * @example 2026-09-02T09:30:00.000Z
       */
      createdAt: string
    }
    /** @description A runtime-configurable setting with its current value, default, and metadata. */
    RuntimeSetting: {
      /**
       * @description Dotted setting key identifying the runtime configuration value, e.g. `rateLimit.apiKey.perMinute`.
       * @example rateLimit.apiKey.perMinute
       */
      key: string
      /**
       * @description Current value of the setting; type depends on the setting key (see `valueType`).
       * @example 600
       */
      value: unknown
      /**
       * @description Type of the value: `number`, `boolean`, `string`, or `json`.
       * @example number
       */
      valueType: components['schemas']['RuntimeSettingValueType']
      /**
       * @description Built-in default applied when no override is set.
       * @example 300
       */
      defaultValue: unknown
      /**
       * @description Human-readable explanation of what the setting controls.
       * @example Maximum API-key requests allowed per minute.
       */
      description: string
      /**
       * @description Grouping category used to organise settings in the UI.
       * @example rateLimit
       */
      category: string
      /**
       * Format: date-time
       * @description When the setting was last changed (ISO 8601).
       * @example 2026-02-01T14:20:00Z
       */
      updatedAt: string
      /**
       * @description Admin user who last changed the setting; null if still at default.
       * @example usr_olivia
       */
      updatedBy: string | null
      /**
       * @description True when the value equals the built-in default (no override has been set).
       * @example false
       */
      isDefault: boolean
      /**
       * @description Closed set of legal values for a string setting, or null when it is free-form. Render it as a dropdown; the PATCH body schema enforces the same set.
       * @example [
       *       "none",
       *       "cdn",
       *       "local"
       *     ]
       */
      enumValues: string[] | null
      /**
       * @description Confirmation text to show before saving, for a setting whose consequence is not obvious from its label. Null when the setting needs no confirmation.
       * @example Stores and returns the complete unmodified upstream payload for this vertical.
       */
      warning: string | null
      /**
       * @description Which direction of a boolean flip the warning guards: `enable` confirms switching to true, `disable` confirms switching to false (kill switches). Null when there is no warning.
       * @example enable
       */
      warnOn?: ('enable' | 'disable') | null
    }
    /** @enum {string} */
    RuntimeSettingValueType: 'number' | 'boolean' | 'string' | 'json'
    /** @description A background platform-logo fetch and its progress. */
    LogoFetchJob: {
      /**
       * @description Job identifier.
       * @example lfj_01HQ8ZKX7M2P4R6T8V0W
       */
      id: string
      /**
       * @description Job lifecycle state.
       * @example running
       * @enum {string}
       */
      status: 'pending' | 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled'
      /**
       * @description True when the job refetches logos that are already stored.
       * @example false
       */
      force: boolean
      /**
       * @description Vertical the job is limited to, or null for all.
       * @example accounting
       */
      vertical: string | null
      /**
       * @description Single platform the job is limited to, or null for all.
       * @example xero
       */
      slug: string | null
      /**
       * @description Milliseconds between Brandfetch requests for this job.
       * @example 400
       */
      delayMs: number
      /**
       * @description Platforms the job will consider.
       * @example 1545
       */
      total: number
      /** @description Live counters, or null before the job starts. */
      progress: components['schemas']['LogoFetchProgress'] | null
      /**
       * @description Failure reason when the job failed.
       * @example null
       */
      error: string | null
      /**
       * @description Identifier of the replica running the job.
       * @example admin-api-7d9f:1:3ab91c2e
       */
      workerId: string | null
      /**
       * @description How many times a worker has claimed this job; a crashed run is requeued.
       * @example 1
       */
      attempts: number
      /**
       * @description Last liveness ping from the owning replica (ISO 8601).
       * @example 2026-02-01T14:20:00.000Z
       */
      heartbeatAt: string | null
      /**
       * Format: date-time
       * @description When the job was queued (ISO 8601).
       * @example 2026-02-01T14:18:00.000Z
       */
      createdAt: string
      /**
       * @description Admin user who started the job.
       * @example usr_olivia
       */
      createdBy: string | null
      /**
       * @description When a worker claimed the job (ISO 8601).
       * @example 2026-02-01T14:19:00.000Z
       */
      startedAt: string | null
      /**
       * @description When the job reached a terminal state (ISO 8601).
       * @example null
       */
      completedAt: string | null
    }
    /** @description Live counters for a running or finished logo fetch. */
    LogoFetchProgress: {
      /**
       * @description Platforms the job will consider in total.
       * @example 1545
       */
      total: number
      /**
       * @description Platforms handled so far.
       * @example 902
       */
      processed: number
      /**
       * @description Logos downloaded and stored.
       * @example 840
       */
      fetched: number
      /**
       * @description Platforms skipped because a logo was already stored.
       * @example 20
       */
      skipped: number
      /**
       * @description Platforms Brandfetch has no logo for. Not a failure — roughly 70 of the catalog have none.
       * @example 42
       */
      notFound: number
      /**
       * @description Platforms abandoned to Brandfetch rate limiting. Counted separately from notFound so a later re-run picks up exactly these.
       * @example 0
       */
      throttled: number
      /**
       * @description Platform being fetched right now.
       * @example xero
       */
      currentSlug: string | null
      /**
       * @description Vertical being fetched right now.
       * @example accounting
       */
      currentVertical: string | null
      /**
       * @description Estimated milliseconds remaining; null until enough platforms have completed to be meaningful.
       * @example 780000
       */
      etaMs: number | null
      /**
       * @description Progress keyed by vertical.
       * @example {
       *       "accounting": {
       *         "total": 214,
       *         "processed": 180,
       *         "fetched": 168,
       *         "skipped": 4,
       *         "notFound": 8
       *       }
       *     }
       */
      byVertical: {
        [key: string]: components['schemas']['LogoFetchVerticalProgress']
      }
      /**
       * @description Most recent non-fatal problem, such as a rate-limit backoff.
       * @example Brandfetch is rate-limiting; backing off.
       */
      lastError: string | null
    }
    /** @description Per-vertical breakdown of a logo fetch. */
    LogoFetchVerticalProgress: {
      /**
       * @description Platforms in this vertical the job will consider.
       * @example 214
       */
      total: number
      /**
       * @description Platforms in this vertical already handled.
       * @example 180
       */
      processed: number
      /**
       * @description Logos downloaded and stored for this vertical.
       * @example 168
       */
      fetched: number
      /**
       * @description Platforms skipped because a logo was already stored.
       * @example 4
       */
      skipped: number
      /**
       * @description Platforms Brandfetch has no logo for.
       * @example 8
       */
      notFound: number
    }
    /** @description Summary of the logos this deployment has stored. */
    LogoStatus: {
      /**
       * @description Platforms with at least one stored logo.
       * @example 1402
       */
      count: number
      /**
       * @description Total size of all stored logo bytes.
       * @example 15728640
       */
      totalBytes: number
      /**
       * @description When the newest stored logo was fetched (ISO 8601), or null when none are stored.
       * @example 2026-02-01T14:20:00.000Z
       */
      lastFetchedAt: string | null
    }
    LogoPurgeResult: {
      /**
       * @description Number of logo rows removed.
       * @example 1402
       */
      deleted: number
    }
    /** @description A configured SSO identity provider (SAML, OIDC, or LDAP) with its non-secret config and JIT settings. */
    IdentityProvider: {
      /**
       * @description Identifier of the identity provider (prefix `idp_`).
       * @example idp_northwind
       */
      id: string
      /**
       * @description Human-friendly display name for the IdP.
       * @example Northwind SSO
       */
      name: string
      /**
       * @description URL-safe identifier used in SSO routes, e.g. `/api/sso/{slug}/...`.
       * @example northwind
       */
      slug: string
      /**
       * @description Authentication protocol: `saml`, `oidc`, or `ldap`.
       * @example oidc
       */
      protocol: components['schemas']['IdpProtocol']
      /**
       * @description Whether this IdP is active and offered as a login option.
       * @example true
       */
      enabled: boolean
      /**
       * @description Non-secret protocol configuration; shape depends on `protocol` (secrets are never included).
       * @example {
       *       "issuer": "https://idp.northwind.example",
       *       "clientId": "opensteward"
       *     }
       */
      config: {
        [key: string]: unknown
      }
      /**
       * @description When true, users are just-in-time provisioned on first successful SSO login.
       * @example true
       */
      jitEnabled: boolean
      /**
       * @description Role assigned to JIT-provisioned users when no role-mapping rule matches.
       * @example viewer
       */
      defaultRole: components['schemas']['Role']
      /** @description Scope applied when no scope rule matches: `all` tenants, or `restricted` to `defaultTenantIds`. */
      defaultScopeMode?: components['schemas']['ScopeMode']
      /**
       * @description Tenants granted by the default scope when it is `restricted` (empty = none).
       * @example []
       */
      defaultTenantIds?: string[]
      /**
       * Format: date-time
       * @description When the IdP was created (ISO 8601).
       * @example 2026-01-15T09:30:00Z
       */
      createdAt: string
      /**
       * Format: date-time
       * @description When the IdP was last modified (ISO 8601).
       * @example 2026-02-01T14:20:00Z
       */
      updatedAt: string
      /**
       * @description Admin user who created the IdP; null if system-seeded.
       * @example usr_olivia
       */
      createdBy: string | null
      /**
       * @description Whether secret material (client secret, keys, etc.) is stored for this IdP.
       * @example true
       */
      hasSecret: boolean
    } & {
      [key: string]: unknown
    }
    /** @enum {string} */
    IdpProtocol: 'saml' | 'oidc' | 'ldap'
    /** @description A rule that maps an IdP claim value to an admin role during SSO login. */
    RoleMappingRule: {
      /**
       * @description Numeric identifier of the role-mapping rule.
       * @example 7
       */
      id: number
      /**
       * @description Identity provider this rule belongs to (prefix `idp_`).
       * @example idp_northwind
       */
      providerId: string
      /**
       * @description Evaluation order; lower numbers are checked first and the first match wins.
       * @example 10
       */
      priority: number
      /**
       * @description Path to the IdP claim/attribute to test, e.g. `groups`.
       * @example groups
       */
      claimPath: string
      /**
       * @description How `matchValue` is compared to the claim: `equals`, `contains`, or `regex`.
       * @example contains
       */
      matchType: components['schemas']['RoleMatchType']
      /**
       * @description Value to compare against the claim using `matchType`.
       * @example opensteward-admins
       */
      matchValue: string
      /**
       * @description Role granted to the user when this rule matches (the base role, for a custom-role rule).
       * @example admin
       */
      role: components['schemas']['Role']
      /**
       * @description Custom role granted when this rule matches; null when the rule grants the built-in `role`.
       * @example null
       */
      roleId?: string | null
      /**
       * Format: date-time
       * @description When the rule was created (ISO 8601).
       * @example 2026-01-15T09:30:00Z
       */
      createdAt: string
    }
    /** @description A rule that grants tenant scope to users whose IdP claim matches, re-applied on every SSO login. */
    ScopeMappingRule: {
      /**
       * @description Numeric identifier of the scope rule.
       * @example 3
       */
      id: number
      /**
       * @description Identity provider this rule belongs to (prefix `idp_`).
       * @example idp_northwind
       */
      providerId: string
      /**
       * @description Display order. Every matching scope rule applies — the tenants are unioned.
       * @example 100
       */
      priority: number
      /**
       * @description Path to the IdP claim/attribute to test.
       * @example groups
       */
      claimPath: string
      /**
       * @description How `matchValue` is compared to the claim: `equals`, `contains`, or `regex`.
       * @example equals
       */
      matchType: components['schemas']['RoleMatchType']
      /**
       * @description Value to compare against the claim.
       * @example acme-support
       */
      matchValue: string
      /**
       * @description Tenants granted when the rule matches. `["*"]` grants every tenant.
       * @example [
       *       "acme"
       *     ]
       */
      tenantIds: string[]
      /**
       * @description Verticals within those tenants: `*` for every vertical, or a list.
       * @example *
       */
      verticals: '*' | string[]
      /**
       * Format: date-time
       * @description When the rule was created (ISO 8601).
       * @example 2026-01-15T09:30:00Z
       */
      createdAt: string
    }
    /** @description A bearer token an IdP uses to provision users/groups via the SCIM endpoints. */
    ScimToken: {
      /**
       * @description Identifier of the SCIM token record (prefix `scim_`).
       * @example scim_1042
       */
      id: string
      /**
       * @description Identity provider this SCIM token authorizes provisioning for (prefix `idp_`).
       * @example idp_northwind
       */
      providerId: string
      /**
       * @description Public, non-secret token prefix shown in listings; the full secret is returned only once, at creation.
       * @example osk_acme_8f3a
       */
      prefix: string
      /**
       * @description Human-friendly label for the token; null if unlabeled.
       * @example Production key
       */
      label: string | null
      /**
       * Format: date-time
       * @description When the token was created (ISO 8601).
       * @example 2026-01-15T09:30:00Z
       */
      createdAt: string
      /**
       * @description Admin user who minted the token; null if system-generated.
       * @example usr_olivia
       */
      createdBy: string | null
      /**
       * @description When the token was last used by the IdP for SCIM provisioning; null if never used.
       * @example 2026-02-01T14:20:00Z
       */
      lastUsedAt: string | null
      /**
       * @description When the token was revoked; null while the token is active.
       * @example null
       */
      revokedAt: string | null
    } & {
      [key: string]: unknown
    }
    /** @description SCIM token with the plaintext value (returned once at mint time). */
    ScimTokenMint: {
      /**
       * @description Identifier of the SCIM token record (prefix `scim_`).
       * @example scim_1042
       */
      id: string
      /**
       * @description Identity provider this SCIM token authorizes provisioning for (prefix `idp_`).
       * @example idp_northwind
       */
      providerId: string
      /**
       * @description Public, non-secret token prefix shown in listings; the full secret is returned only once, at creation.
       * @example osk_acme_8f3a
       */
      prefix: string
      /**
       * @description Human-friendly label for the token; null if unlabeled.
       * @example Production key
       */
      label: string | null
      /**
       * Format: date-time
       * @description When the token was created (ISO 8601).
       * @example 2026-01-15T09:30:00Z
       */
      createdAt: string
      /**
       * @description Admin user who minted the token; null if system-generated.
       * @example usr_olivia
       */
      createdBy: string | null
      /**
       * @description When the token was last used by the IdP for SCIM provisioning; null if never used.
       * @example 2026-02-01T14:20:00Z
       */
      lastUsedAt: string | null
      /**
       * @description When the token was revoked; null while the token is active.
       * @example null
       */
      revokedAt: string | null
      /**
       * @description The full plaintext SCIM token; shown only once at mint time and never retrievable again.
       * @example osk_acme_8f3a2b9c4d5e6f7a8b9c0d1e
       */
      plaintext: string
    } & {
      [key: string]: unknown
    }
    /** @description Login options surfaced to the unauthenticated login screen (SSO providers and local-login flag). */
    LoginOptions: {
      /** @description Enabled SSO providers offered as login options. */
      providers: components['schemas']['PublicIdentityProvider'][]
      /**
       * @description Whether local username/password login is available alongside SSO.
       * @example true
       */
      localLoginEnabled: boolean
    }
    /** @description Minimal, non-sensitive IdP info exposed on the public login screen. */
    PublicIdentityProvider: {
      /**
       * @description URL-safe identifier used to initiate SSO for this provider.
       * @example northwind
       */
      slug: string
      /**
       * @description Display name shown on the login screen.
       * @example Northwind SSO
       */
      name: string
      /**
       * @description Authentication protocol used by the provider.
       * @example oidc
       */
      protocol: components['schemas']['IdpProtocol']
    }
    /** @description Migration status for one database: its path, existence, and applied migration versions. */
    SchemaStatusEntry: {
      /**
       * @description Logical database/namespace name.
       * @example accounting
       */
      db: string
      /**
       * @description Filesystem path of the database file.
       * @example /var/lib/opensteward/accounting.db
       */
      path: string
      /** @description Applied migration rows for this database, in version order. */
      rows: components['schemas']['SchemaMigrationRow'][]
      /**
       * @description Whether the database file exists on disk.
       * @example true
       */
      exists: boolean
    }
    /** @description One applied schema-migration record for a database namespace. */
    SchemaMigrationRow: {
      /**
       * @description Migration namespace, typically the vertical/database the migration belongs to.
       * @example accounting
       */
      namespace: string
      /**
       * @description Applied schema version number for this namespace.
       * @example 12
       */
      version: number
      /**
       * Format: date-time
       * @description When this migration version was applied (ISO 8601).
       * @example 2026-01-15T09:30:00Z
       */
      appliedAt: string
    }
    /** @description The deployment's license as integration-server evaluates it, as admin-api last read it. Never contains the license token. */
    LicenseStatus: {
      /**
       * @description License state. EXPIRING: within 30 days of expiry. GRACE: up to 30 days past it, everything still works. DEGRADED, INVALID, MISSING: community mode.
       * @example VALID
       * @enum {string}
       */
      state: 'VALID' | 'EXPIRING' | 'GRACE' | 'DEGRADED' | 'INVALID' | 'MISSING'
      /**
       * @description Why the state is INVALID (e.g. `BAD_SIGNATURE`, `UNKNOWN_KID`, `REVOKED`, `FILE_UNREADABLE`) or DEGRADED (`EXPIRED`).
       * @example BAD_SIGNATURE
       */
      reason?: string
      /**
       * @description Where integration-server read the license: `OPENSTEWARD_LICENSE` (env), a file, or nowhere.
       * @example file
       * @enum {string}
       */
      source: 'env' | 'file' | 'none'
      /**
       * @description The license file integration-server read or looked for, as a path inside its container.
       * @example /etc/opensteward/license/license.key
       */
      filePath?: string
      /**
       * @description The license file integration-server is ignoring because OPENSTEWARD_LICENSE is set (the env value wins). Renewing that file changes nothing until the env value is removed.
       * @example /etc/opensteward/license/license.key
       */
      shadowedFile?: string
      /**
       * @description License ID.
       * @example lic_8f3k2a9x
       */
      licenseId?: string
      /**
       * @description Organisation the license is issued to.
       * @example Acme Forsakring AB
       */
      org?: string
      /**
       * @description Plan name, for display only: what is enabled comes from `features` and `limits`.
       * @example free
       */
      tier?: string
      /**
       * @description Install label chosen when the license was issued.
       * @example production
       */
      label?: string
      /**
       * @description Licensed environment. `dev` marks a development license, which production builds refuse.
       * @example prod
       */
      env?: string
      /**
       * @description ID of the key that signed the license.
       * @example k2026a
       */
      kid?: string
      /**
       * @description Enabled features: `mcp` and `vertical:<name>`.
       * @example [
       *       "mcp",
       *       "vertical:accounting",
       *       "vertical:crm"
       *     ]
       */
      features: string[]
      /** @description Limits in force (the community limits outside VALID, EXPIRING and GRACE). */
      limits: {
        /**
         * @description Maximum connections.
         * @example 5
         */
        connections: number
        /**
         * @description Maximum registered tenants, counting 'default'.
         * @example 1
         */
        tenants: number
      }
      /**
       * Format: date-time
       * @description When the license was issued.
       * @example 2026-10-06T17:00:00.000Z
       */
      issuedAt?: string
      /**
       * Format: date-time
       * @description When the license expires.
       * @example 2027-10-06T17:00:00.000Z
       */
      expiresAt?: string
      /**
       * @description Whole days until expiry; negative after it.
       * @example 362
       */
      daysRemaining?: number
      /**
       * @description `license` while the license grants what is enabled; `community` in community mode.
       * @example license
       * @enum {string}
       */
      entitlementSource: 'license' | 'community'
      /**
       * @description True when the host clock is behind the latest time licensing has seen.
       * @example false
       */
      clockRollbackDetected: boolean
      /**
       * @description State of the license revocation list shipped with this build.
       * @example ok
       * @enum {string}
       */
      revocationList: 'ok' | 'missing' | 'invalid'
      /**
       * Format: date-time
       * @description When integration-server last evaluated the license.
       * @example 2026-10-09T12:00:00.000Z
       */
      evaluatedAt: string
      /**
       * @description Where to get or renew a license.
       * @example https://opensteward.dev/license
       */
      renewalUrl: string
      /** @description Usage counted against the limits. */
      usage: {
        /**
         * @description Connections integration-server holds (what `limits.connections` is checked against); null when it could not count them.
         * @example 3
         */
        connections: number | null
        /**
         * @description Tenants registered in admin-api, counting 'default' — what `limits.tenants` is checked against.
         * @example 1
         */
        tenants: number
      }
      /**
       * Format: date-time
       * @description End of the 30-day grace period after `expiresAt`; after it the deployment runs in community mode.
       * @example 2027-11-05T17:00:00.000Z
       */
      graceEndsAt?: string
      /**
       * @description True when integration-server is not answering and this is the last status it gave.
       * @example false
       */
      stale: boolean
      /**
       * Format: date-time
       * @description When admin-api last read this status from integration-server.
       * @example 2026-10-09T12:00:00.000Z
       */
      fetchedAt: string
    }
    /** @description What the data store holds for one connection in your scope. */
    DataConnectionSummary: {
      /**
       * @description Connection id.
       * @example 9f8e7d6c-1a2b-4c3d-8e9f-0a1b2c3d4e5f
       */
      connectionId: string
      /**
       * @description Vertical.
       * @example crm
       */
      vertical: string
      /**
       * @description Platform slug.
       * @example hubspot
       */
      platform: string
      /**
       * @description Connection label.
       * @example Acme CRM
       */
      label: string | null
      /**
       * @description Deployment tenant that owns the connection.
       * @example acme
       */
      ownerTenantId: string | null
      /**
       * @description Stored resource types, alphabetical.
       * @example []
       */
      resources: components['schemas']['DataResourceSummary'][]
    }
    /** @description Stored records of one type on one connection. */
    DataResourceSummary: {
      /**
       * @description Stored resource type.
       * @example contacts
       */
      resourceType: string
      /**
       * @description Records stored for this connection.
       * @example 1240
       */
      count: number
      /**
       * @description When the newest record last changed (epoch ms); null when none.
       * @example 1767225600000
       */
      latestChangedAt: number | null
      /**
       * @description When the last full sync of this type finished (epoch ms); null if never.
       * @example 1767225600000
       */
      collectionCompletedAt: number | null
      /**
       * @description False when the type has no field classification; every field is then masked as personal data.
       * @example true
       */
      classified: boolean
    }
    /** @description Fields, classes and searchability of a resource type. */
    DataSchema: {
      /**
       * @description Vertical.
       * @example crm
       */
      vertical: string
      /**
       * @description Resource type.
       * @example contacts
       */
      resourceType: string
      /**
       * @description Whether the type is classified.
       * @example true
       */
      classified: boolean
      /**
       * @description Class of fields with no rule of their own.
       * @example internal
       */
      defaultClass: string
      /**
       * @description Fields and their classes.
       * @example []
       */
      fields: components['schemas']['DataField'][]
    }
    /** @description One field of a stored resource type. */
    DataField: {
      /**
       * @description Dotted field path.
       * @example email
       */
      path: string
      /**
       * @description Classification of the field.
       * @example pii
       * @enum {string}
       */
      class: 'public' | 'internal' | 'pii' | 'financial' | 'secret'
      /**
       * @description Mask applied when hidden.
       * @example email
       */
      mask: string | null
      /**
       * @description True when the path has its own classification entry.
       * @example true
       */
      classified: boolean
      /**
       * @description True when the path is a top-level field of the canonical schema.
       * @example true
       */
      inSchema: boolean
      /**
       * @description Whether you may filter and search on this field.
       * @example false
       */
      searchable: boolean
    }
    /** @description One stored record, masked for the caller. */
    DataRecord: {
      /**
       * @description Record id.
       * @example cont_jane
       */
      id: string
      /**
       * @description Resource type.
       * @example contacts
       */
      resourceType: string
      /**
       * @description Vertical.
       * @example crm
       */
      vertical: string
      /**
       * @description Platform slug.
       * @example hubspot
       */
      platform: string
      /**
       * @description Connection id.
       * @example 9f8e7d6c-1a2b-4c3d-8e9f-0a1b2c3d4e5f
       */
      connectionId: string
      /**
       * @description When the record was fetched (ISO 8601).
       * @example 2026-03-01T10:00:00.000Z
       */
      fetchedAt: string | null
      /**
       * @description When the stored row was last written (ISO 8601).
       * @example 2026-03-01T10:00:00.000Z
       */
      updatedAt: string | null
      /**
       * @description When the record content last changed (ISO 8601).
       * @example 2026-03-01T10:00:00.000Z
       */
      changedAt: string | null
      /**
       * @description Normaliser version that wrote the record.
       * @example 1
       */
      normVersion: string | null
      /**
       * @description The canonical record, masked by field classification: personal data masked unless revealed, secrets removed.
       * @example {
       *       "id": "cont_jane",
       *       "email": "j***@acme.example",
       *       "title": "CFO"
       *     }
       */
      data: {
        [key: string]: unknown
      }
    }
    /** @description Pagination and masking of a record page. */
    DataRecordPageMeta: {
      /**
       * @description Personal data is unmasked.
       * @example false
       */
      piiRevealed: boolean
      /**
       * @description Financial fields are masked.
       * @example false
       */
      financialMasked: boolean
      /**
       * @description The type is classified.
       * @example true
       */
      classified: boolean
      /**
       * @description Opaque cursor for the next page; null on the last.
       * @example eyJ2IjoxfQ
       */
      nextCursor: string | null
      /**
       * @description Matching records (capped).
       * @example 1240
       */
      total: number
      /**
       * @description True when `total` hit the count cap (10,000).
       * @example false
       */
      totalCapped: boolean
    }
    /** @description How a stored record was masked. */
    DataRecordMeta: {
      /**
       * @description Personal data is unmasked.
       * @example false
       */
      piiRevealed: boolean
      /**
       * @description Financial fields are masked.
       * @example false
       */
      financialMasked: boolean
      /**
       * @description The type is classified.
       * @example true
       */
      classified: boolean
    }
    /** @description A native dashboard. */
    Dashboard: {
      /**
       * @description Dashboard id: `builtin:<slug>` or `dsh_…`.
       * @example builtin:ecommerce
       */
      id: string
      /**
       * @description Dashboard name.
       * @example Ecommerce
       */
      name: string
      /**
       * @description What the dashboard is for.
       * @example Orders and revenue.
       */
      description: string | null
      /**
       * @description Widgets, in display order.
       * @example []
       */
      widgets: components['schemas']['DashboardWidgetOutput'][]
      /**
       * @description Defined in code; read-only.
       * @example true
       */
      builtin: boolean
      /**
       * @description The vertical a built-in dashboard is about; null otherwise.
       * @example ecommerce
       */
      vertical: string | null
      /**
       * @description Owner; null for a built-in.
       * @example usr_1
       */
      ownerUserId: string | null
      audience: components['schemas']['DashboardAudienceView']
      pinnedTenants: components['schemas']['DashboardPinnedTenantsView']
      /**
       * @description Whether you may edit or delete it.
       * @example false
       */
      editable: boolean
      /**
       * @description ISO 8601; null for a built-in.
       * @example 2026-03-01T10:00:00.000Z
       */
      createdAt: string | null
      /**
       * @description ISO 8601; null for a built-in.
       * @example 2026-03-01T10:00:00.000Z
       */
      updatedAt: string | null
    }
    /**
     * @description Who can see a dashboard, as returned by the API.
     * @example {
     *       "kind": "tenants",
     *       "tenants": [
     *         "acme"
     *       ]
     *     }
     */
    DashboardAudienceView: {
      /**
       * @description `private` (only the owner), `tenants` or `everyone`.
       * @example tenants
       * @enum {string}
       */
      kind: 'private' | 'tenants' | 'everyone'
      /**
       * @description For `tenants`: who it is shared with (limited to your own access unless you may edit it).
       * @example [
       *       "acme"
       *     ]
       */
      tenants?: string[]
    }
    /**
     * @description Tenants the data is limited to; `null` = every tenant the viewer can see.
     * @example [
     *       "acme"
     *     ]
     */
    DashboardPinnedTenantsView: string[] | null
    /** @description One metric in the catalog. */
    MetricInfo: {
      /**
       * @description Metric id.
       * @example ecommerce.orders_per_day
       */
      id: string
      /**
       * @description Title.
       * @example Orders per day
       */
      title: string
      /**
       * @description What it measures.
       * @example Orders created per day.
       */
      description: string
      /**
       * @description Shape of the result.
       * @example timeseries
       * @enum {string}
       */
      kind:
        | 'value'
        | 'timeseries'
        | 'breakdown'
        | 'ratio'
        | 'duration'
        | 'aging'
        | 'concentration'
        | 'matrix'
        | 'histogram'
        | 'composition'
        | 'dso'
        | 'dpo'
        | 'ccc'
        | 'table'
      /**
       * @description Unit of the headline value (`percent` is 0–100).
       * @example count
       * @enum {string}
       */
      unit: 'count' | 'money' | 'percent' | 'days' | 'hours' | 'index' | 'quantity'
      /**
       * @description Where the metric sits inside its vertical, for grouping in the editor.
       * @example sales
       * @enum {string}
       */
      section:
        | 'overview'
        | 'sales'
        | 'receivables'
        | 'payables'
        | 'cash'
        | 'tax'
        | 'profitability'
        | 'customers'
        | 'products'
        | 'fulfillment'
        | 'subscriptions'
        | 'pipeline'
        | 'performance'
        | 'activity'
        | 'workload'
        | 'quality'
        | 'speed'
        | 'satisfaction'
        | 'delivery'
        | 'cost'
        | 'stock'
        | 'purchasing'
        | 'risk'
        | 'system'
      /**
       * @description Vertical; null for system metrics.
       * @example ecommerce
       */
      vertical: string | null
      /**
       * @description Resource type; null for system metrics.
       * @example orders
       */
      resourceType: string | null
      /**
       * @description Chart types that fit this metric; the first is the default.
       * @example [
       *       "line",
       *       "area",
       *       "bar"
       *     ]
       */
      charts: components['schemas']['DashboardChart'][]
      /**
       * @description Values are money, one set per currency, never combined across currencies.
       * @example false
       */
      money: boolean
      /**
       * @description The `currency` parameter changes the result.
       * @example false
       */
      currencyAware: boolean
      /**
       * @description Evaluated as of now: the range is ignored.
       * @example false
       */
      snapshot: boolean
      /**
       * @description The `granularity` parameter applies (a series over time).
       * @example true
       */
      granular: boolean
      /**
       * @description `compare=1` adds `previous`, the prior equal-length range.
       * @example true
       */
      comparable: boolean
      /**
       * @description The bucket size this metric uses when a request leaves `granularity` unset (or `auto`); absent means the range decides.
       * @example month
       * @enum {string}
       */
      defaultGranularity?: 'day' | 'week' | 'month'
      thresholds?: components['schemas']['MetricThresholds']
      /**
       * @description A caveat to show under the widget.
       * @example Proxy: updatedAt as completion date.
       */
      note?: string
    }
    /** @description Levels that colour a number or gauge chart, in the metric’s unit. */
    MetricThresholds: {
      /**
       * @description Warning level.
       * @example 20
       */
      warn: number
      /**
       * @description Critical level.
       * @example 40
       */
      crit: number
      /**
       * @description `above`: higher is worse; `below`: lower is worse.
       * @example above
       * @enum {string}
       */
      direction: 'above' | 'below'
    }
    /** @description A metric computed over your scope. */
    MetricResult: {
      metric: components['schemas']['MetricInfo']
      /**
       * @description Days covered.
       * @example {
       *       "from": "2026-03-01",
       *       "to": "2026-03-30"
       *     }
       */
      range: {
        /**
         * @description First day, inclusive.
         * @example 2026-03-01
         */
        from: string
        /**
         * @description Last day, inclusive.
         * @example 2026-03-30
         */
        to: string
      }
      /**
       * @description Bucket size of a series over time; null for other kinds.
       * @example day
       */
      granularity: ('day' | 'week' | 'month') | null
      /**
       * @description The currency filter applied; null means every currency, each separately.
       * @example null
       */
      currency: string | null
      /**
       * @description Currencies present in scope and range before the filter ([] for currency-free metrics).
       * @example [
       *       "EUR",
       *       "USD"
       *     ]
       */
      currencies: string[]
      /**
       * @description Headline for currency-free metrics (count, percent, days, index); null for money, and for a result that spans several currencies.
       * @example 120
       */
      value: number | null
      /**
       * @description With `compare=1`: the same metric over the prior equal-length range.
       * @example {
       *       "value": 98,
       *       "range": {
       *         "from": "2026-01-30",
       *         "to": "2026-02-28"
       *       }
       *     }
       */
      previous?: {
        /**
         * @description Headline over the prior range.
         * @example 98
         */
        value: number | null
        /**
         * @description Money headlines over the prior range, one per currency.
         * @example []
         */
        totals?: components['schemas']['MetricTotal'][]
        /**
         * @description Days covered.
         * @example {
         *       "from": "2026-03-01",
         *       "to": "2026-03-30"
         *     }
         */
        range: {
          /**
           * @description First day, inclusive.
           * @example 2026-03-01
           */
          from: string
          /**
           * @description Last day, inclusive.
           * @example 2026-03-30
           */
          to: string
        }
      }
      /**
       * @description Money headlines, one per currency.
       * @example []
       */
      totals?: components['schemas']['MetricTotal'][]
      /**
       * @description Series to chart; money series always carry `currency`.
       * @example []
       */
      series: components['schemas']['MetricSeries'][]
      /**
       * @description Named numbers.
       * @example []
       */
      kpis?: components['schemas']['MetricKpi'][]
      /**
       * @description Rows of the result: top-N with share and cumulative share, stats, lists.
       * @example {
       *       "columns": [],
       *       "rows": []
       *     }
       */
      table?: {
        columns: {
          key: string
          label: string
        }[]
        rows: {
          [key: string]: string | number | null
        }[]
      }
      /**
       * @description Heatmap cells (matrix kind).
       * @example {
       *       "x": [
       *         "Mon"
       *       ],
       *       "y": [
       *         "09:00 UTC"
       *       ],
       *       "cells": [
       *         [
       *           0,
       *           0,
       *           3
       *         ]
       *       ]
       *     }
       */
      matrix?: {
        x: string[]
        y: string[]
        /**
         * @description `[xIndex, yIndex, value]`, every cell present.
         * @example [
         *       [
         *         0,
         *         0,
         *         3
         *       ]
         *     ]
         */
        cells: number[][]
      }
      /**
       * @description Distributions: `All` first, then one per group.
       * @example []
       */
      stats?: components['schemas']['MetricStats'][]
      /**
       * @description How many records the metric could use.
       * @example {
       *       "eligible": 62,
       *       "total": 100
       *     }
       */
      coverage?: {
        /**
         * @description Records carrying every coverage field.
         * @example 62
         */
        eligible: number
        /**
         * @description Records in scope and range.
         * @example 100
         */
        total: number
      }
      thresholds?: components['schemas']['MetricThresholds']
      /**
       * @description A caveat to show under the widget.
       * @example Weekday and hour are UTC.
       */
      note?: string
      /**
       * @description True when financial values are withheld by `data_access.mask_financial`.
       * @example false
       */
      masked: boolean
      /**
       * @description The connection / adapter filter applied, when `connection` or `platform` was given; absent otherwise.
       * @example {
       *       "connection": null,
       *       "platform": "shopify",
       *       "vertical": "ecommerce"
       *     }
       */
      filter?: {
        /**
         * @description The connection the result is narrowed to; null for every connection.
         * @example 0b6f3c1e-8a2d-4c55-9e0f-3d1f2a7b9c10
         */
        connection: string | null
        /**
         * @description The adapter the result is narrowed to; null for every adapter.
         * @example shopify
         */
        platform: string | null
        /**
         * @description The vertical the filter was kept to; null when the request named none.
         * @example ecommerce
         */
        vertical: string | null
      }
      /**
       * @description When the values were computed (cached up to 60 s).
       * @example 2026-03-30T10:00:00.000Z
       */
      generatedAt: string
    }
    /** @description A money headline for one currency. */
    MetricTotal: {
      /**
       * @description Currency; null when the records carried none.
       * @example USD
       */
      currency: string | null
      /**
       * @description Amount in major units.
       * @example 19.99
       */
      amount: number
      /**
       * @description Amount in minor units.
       * @example 1999
       */
      amountMinor: number
    }
    /** @description One series of a metric result. */
    MetricSeries: {
      /**
       * @description Series name.
       * @example USD
       */
      name: string
      /**
       * @description ISO 4217 code of a money series; null when its records carried none. Absent on counts. A series never mixes currencies.
       * @example USD
       */
      currency?: string | null
      /**
       * @description How a `combo` chart draws this series.
       * @example bar
       * @enum {string}
       */
      kind?: 'bar' | 'line'
      /**
       * @description Points.
       * @example []
       */
      points: components['schemas']['MetricPoint'][]
    }
    /** @description One point of a series. */
    MetricPoint: {
      /**
       * @description Bucket (`YYYY-MM-DD`, `YYYY-Www`, `YYYY-MM`) or category.
       * @example 2026-03-01
       */
      x: string
      /**
       * @description Value (money in major units); null for a bucket with no defined value (a ratio with no denominator, an average of nothing).
       * @example 42
       */
      y: number | null
    }
    /** @description A named number of a metric result. */
    MetricKpi: {
      /**
       * @description Stable key (`p50`, `hhi`, `top5_share`, `numerator`, …).
       * @example p50
       */
      key: string
      /**
       * @description Display label.
       * @example Median
       */
      label: string
      /**
       * @description Value; null when undefined.
       * @example 3.5
       */
      value: number | null
      /**
       * @description Unit of the value.
       * @example days
       * @enum {string}
       */
      unit: 'count' | 'money' | 'percent' | 'days' | 'hours' | 'index' | 'quantity'
      /**
       * @description Currency of a per-currency KPI; absent on currency-free ones.
       * @example USD
       */
      currency?: string | null
    }
    /** @description The distribution of one group (a boxplot). */
    MetricStats: {
      /**
       * @description Group label; the first entry is `All`.
       * @example All
       */
      group: string
      /**
       * @description Values in the group.
       * @example 12
       */
      n: number
      /**
       * @description Minimum.
       * @example 0.5
       */
      min: number
      /**
       * @description 25th percentile.
       * @example 1
       */
      p25: number
      /**
       * @description Median.
       * @example 2
       */
      p50: number
      /**
       * @description 75th percentile.
       * @example 4
       */
      p75: number
      /**
       * @description 90th percentile.
       * @example 7
       */
      p90: number
      /**
       * @description Maximum.
       * @example 12
       */
      max: number
      /**
       * @description Mean.
       * @example 3.1
       */
      mean: number
    }
    /** @description What a dashboard’s connection filter offers. */
    DashboardConnections: {
      /**
       * @description Matching connections, at most `limit`: an exact id match first, then by label (unlabelled last), then id.
       * @example []
       */
      connections: components['schemas']['DashboardConnection'][]
      /**
       * @description The adapters among the vertical’s connections you can see (ignoring `search` and `platform`), by slug.
       * @example [
       *       {
       *         "slug": "shopify",
       *         "name": "Shopify",
       *         "count": 3
       *       }
       *     ]
       */
      platforms: components['schemas']['DashboardConnectionPlatform'][]
      /**
       * @description How many connections match, before `limit`.
       * @example 3
       */
      total: number
    }
    /** @description A connection a dashboard can be filtered to. Carries no tenant, status or credential. */
    DashboardConnection: {
      /**
       * @description Connection id: the value of a metric’s `connection` parameter.
       * @example 0b6f3c1e-8a2d-4c55-9e0f-3d1f2a7b9c10
       */
      id: string
      /**
       * @description The name the operator gave the connection; null when it has none.
       * @example Acme main shop
       */
      label: string | null
      /**
       * @description Adapter slug.
       * @example shopify
       */
      platform: string
      /**
       * @description Vertical.
       * @example ecommerce
       */
      vertical: string
    }
    /** @description An adapter a dashboard can be filtered to. */
    DashboardConnectionPlatform: {
      /**
       * @description Adapter slug.
       * @example shopify
       */
      slug: string
      /**
       * @description Display name from the platform catalog; the slug when the catalog has none.
       * @example Shopify
       */
      name: string
      /**
       * @description Connections of this adapter you can see.
       * @example 3
       */
      count: number
    }
    /** @description Whether embedded Superset dashboards are available. */
    SupersetStatus: {
      /**
       * @description True when admin-api is configured with a Superset URL.
       * @example true
       */
      enabled: boolean
      /**
       * @description Browser-facing Superset URL the admin UI embeds from; null when disabled.
       * @example https://superset.example.com
       */
      publicUrl: string | null
    }
    /** @description An embeddable Superset dashboard. */
    SupersetDashboard: {
      /**
       * @description Registry id.
       * @example ssd_0123456789abcdef0123
       */
      id: string
      /**
       * @description Title.
       * @example Connection data overview
       */
      title: string
      /**
       * @description What the dashboard shows.
       * @example Records per vertical and the connections behind them.
       */
      description: string | null
      /**
       * @description Id of the dashboard’s embedded configuration in Superset.
       * @example 6c0a4bd6-3f7c-4c5e-9d52-7b1f0e0f2a11
       */
      embeddedUuid: string
      /**
       * @description Verticals it is about; null when not tied to one.
       * @example null
       */
      verticals: string[] | null
      /**
       * @description Permission needed on top of `dashboards:view`; null when none.
       * @example null
       */
      requiredPermission: string | null
      audience: components['schemas']['DashboardAudienceView']
      pinnedTenants: components['schemas']['DashboardPinnedTenantsView']
      /**
       * @description When the registry entry last changed (ISO 8601).
       * @example 2026-09-01T10:00:00.000Z
       */
      updatedAt: string
    }
    /** @description A short-lived Superset guest token. */
    SupersetGuestToken: {
      /**
       * @description The guest token (a JWT signed by Superset).
       * @example eyJ…
       */
      token: string
      /**
       * @description When the token expires (ISO 8601), when Superset says.
       * @example 2026-09-01T10:05:00.000Z
       */
      expiresAt: string | null
      /**
       * @description Embedded configuration id to pass to the embedded SDK.
       * @example 6c0a4bd6-3f7c-4c5e-9d52-7b1f0e0f2a11
       */
      embeddedUuid: string
      /**
       * @description Browser-facing Superset URL.
       * @example https://superset.example.com
       */
      supersetDomain: string
      /**
       * @description True when the token carries a tenant row-level-security clause.
       * @example false
       */
      restricted: boolean
    }
    /** @description One destination type and its settings form. */
    DestinationTypeInfo: {
      /**
       * @description Type id.
       * @example s3
       */
      type: string
      /**
       * @description Display name.
       * @example Amazon S3 (and S3-compatible)
       */
      label: string
      /**
       * @description `object_store` (Parquet files), `table` (rows in a database) or `loader`.
       * @example object_store
       */
      kind: string
      /**
       * @description False for reserved types that cannot be created yet.
       * @example true
       */
      available: boolean
      /**
       * @description True for types whose behaviour may still change.
       * @example false
       */
      experimental?: boolean
      /**
       * @description JSON Schema of the non-secret settings.
       * @example {
       *       "type": "object",
       *       "properties": {
       *         "bucket": {
       *           "type": "string"
       *         }
       *       }
       *     }
       */
      configSchema: {
        [key: string]: unknown
      } | null
      /**
       * @description JSON Schema of the write-only credential fields.
       * @example {
       *       "type": "object",
       *       "properties": {
       *         "secretAccessKey": {
       *           "type": "string"
       *         }
       *       }
       *     }
       */
      secretsSchema: {
        [key: string]: unknown
      } | null
      /**
       * @description Names of the write-only fields.
       * @example [
       *       "accessKeyId",
       *       "secretAccessKey",
       *       "sessionToken"
       *     ]
       */
      secretFields: string[]
    }
    /** @description A warehouse or lake destination. Never carries secrets. */
    Destination: {
      /**
       * @description Destination id.
       * @example 5b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b
       */
      id: string
      /**
       * @description Display name.
       * @example Lake (prod)
       */
      name: string
      /**
       * @description Destination type, one of the ids in the type catalog (e.g. `s3`, `postgres`).
       * @example s3
       */
      type: string
      /**
       * @description Non-secret settings, as validated for the type.
       * @example {
       *       "bucket": "lake",
       *       "region": "eu-west-1",
       *       "prefix": "opensteward/"
       *     }
       */
      config: {
        [key: string]: unknown
      }
      /**
       * @description Names of the credential fields that hold a value. Values are never returned.
       * @example [
       *       "accessKeyId",
       *       "secretAccessKey"
       *     ]
       */
      secretFieldsSet: string[]
      /**
       * @description True when personal data is exported unmasked.
       * @example false
       */
      includePii: boolean
      /**
       * @description User id that approved exporting personal data; null when masked.
       * @example null
       */
      piiApprovedBy: string | null
      scope: components['schemas']['DestinationScopeOutput']
      /**
       * @description Seconds between runs.
       * @example 3600
       */
      intervalSec: number
      /**
       * @description Whether scheduled runs happen.
       * @example true
       */
      enabled: boolean
      /**
       * @description User id that created the destination.
       * @example b3c4d5e6-0000-4000-8000-000000000001
       */
      createdBy: string | null
      /**
       * @description When the destination was created (ISO 8601).
       * @example 2026-09-29T12:00:00.000Z
       */
      createdAt: string | null
      /**
       * @description When the destination last changed (ISO 8601).
       * @example 2026-09-29T12:00:00.000Z
       */
      updatedAt: string | null
      /**
       * @description When the last run started (ISO 8601); null if never.
       * @example 2026-09-29T13:00:00.000Z
       */
      lastRunAt: string | null
      /**
       * @description Status of the last run: `running`, `success` or `failed`; null if never run.
       * @example success
       */
      lastStatus: string | null
      /**
       * @description Error of the last failed run.
       * @example null
       */
      lastError: string | null
    }
    /** @description Outcome of a destination connection test. */
    DestinationTestResult: {
      /**
       * @description Whether the test passed.
       * @example true
       */
      ok: boolean
      /**
       * @description Why it failed.
       * @example AccessDenied: Access Denied
       */
      error?: string
      /**
       * @description How long the test took.
       * @example 412
       */
      latencyMs: number
    }
    /** @description A run that was started. */
    DestinationRunStarted: {
      /**
       * @description Id of the run started.
       * @example 0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d
       */
      runId: string
    }
    /** @description Outcome of a backfill. */
    DestinationBackfillResult: {
      /**
       * @description Cursors reset.
       * @example 3
       */
      cursorsReset: number
      /**
       * @description Run started; null when none was (disabled, or one is already running).
       * @example 0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d
       */
      runId: string | null
    }
    /** @description One export run of a destination. */
    DestinationRun: {
      /**
       * @description Run id.
       * @example 0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d
       */
      id: string
      /**
       * @description Destination id.
       * @example 5b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b
       */
      destinationId: string
      /**
       * @description What started it: `schedule`, `manual` or `backfill`.
       * @example schedule
       */
      trigger: string
      /**
       * @description `running`, `success` or `failed`.
       * @example success
       */
      status: string
      /**
       * @description Start time (ISO 8601).
       * @example 2026-09-29T12:00:00.000Z
       */
      startedAt: string | null
      /**
       * @description End time (ISO 8601); null while running.
       * @example 2026-09-29T12:00:04.210Z
       */
      finishedAt: string | null
      /**
       * @description Rows exported.
       * @example 1250
       */
      rowsWritten: number
      /**
       * @description Deletions exported.
       * @example 3
       */
      deletesWritten: number
      /**
       * @description Files written.
       * @example []
       */
      files: components['schemas']['DestinationRunFile'][]
      /**
       * @description Why it failed.
       * @example null
       */
      error: string | null
    }
    /** @description A file (or table batch) a run wrote. */
    DestinationRunFile: {
      /**
       * @description Path relative to the destination prefix (object stores) or the table name.
       * @example vertical=crm/resource_type=contacts/dt=2026-09-29/5b1c-00000.parquet
       */
      path: string
      /**
       * @description `rows`, `deletes`, `manifest` or `table`.
       * @example rows
       */
      kind: string
      /**
       * @description Vertical.
       * @example crm
       */
      vertical?: string
      /**
       * @description Resource type.
       * @example contacts
       */
      resourceType?: string
      /**
       * @description Rows written.
       * @example 1250
       */
      rows: number
    }
    /** @description State of read-only SQL access on this deployment. */
    SqlAccessStatus: {
      /**
       * @description Database backend. SQL access needs `postgres`.
       * @example postgres
       * @enum {string}
       */
      backend: 'postgres' | 'sqlite'
      /**
       * @description `managed` when `ANALYTICS_ADMIN_DATABASE_URL` is set (OpenSteward creates roles and views itself); `manual` when an operator runs the provisioning script.
       * @example managed
       * @enum {string}
       */
      mode: 'managed' | 'manual'
      /**
       * @description Views are deployed.
       * @example true
       */
      provisioned: boolean
      /**
       * @description Deployed catalog version; null when not provisioned.
       * @example 1
       */
      version: number | null
      /**
       * @description Hash of the deployed catalog.
       * @example 9d2f…
       */
      hash: string | null
      /**
       * @description Hash of this build's catalog.
       * @example 9d2f…
       */
      catalogHash: string
      /**
       * @description The deployed views match this build's catalog.
       * @example true
       */
      upToDate: boolean
      /**
       * @description Host BI tools should connect to (`ANALYTICS_READ_HOST`), often a replica.
       * @example replica.internal
       */
      readHost: string | null
      /**
       * @description Postgres database name.
       * @example opensteward
       */
      database: string | null
      /**
       * @description Stable schema names.
       * @example {
       *       "masked": "os_analytics",
       *       "pii": "os_analytics_pii"
       *     }
       */
      schemas: {
        /**
         * @description Masked schema.
         * @example os_analytics
         */
        masked: string
        /**
         * @description Unmasked schema.
         * @example os_analytics_pii
         */
        pii: string
      }
      /**
       * @description Whether pgcrypto is installed (hmac masks need it).
       * @example true
       */
      pgcrypto: boolean | null
      /**
       * @description Deployment problems worth fixing.
       * @example []
       */
      warnings: string[]
    }
    /** @description Outcome of provisioning the SQL views. */
    SqlAccessProvisionResult: {
      /**
       * @description Whether anything was (re)created.
       * @example true
       */
      changed: boolean
      /**
       * @description Catalog version now deployed.
       * @example 1
       */
      version: number
      /**
       * @description Deployed catalog hash.
       * @example 9d2f…
       */
      hash: string
      /**
       * @description A new version was cut because a view or column was removed or retyped.
       * @example false
       */
      breaking: boolean
      /**
       * @description What changed, one line each.
       * @example []
       */
      changes: string[]
      /**
       * @description Deployment warnings.
       * @example []
       */
      warnings: string[]
    }
    /** @description The SQL views and their columns. */
    SqlAccessCatalog: {
      /**
       * @description Catalog format.
       * @example 1
       */
      format: number
      /**
       * @description Catalog hash.
       * @example 9d2f…
       */
      hash: string
      /**
       * @description Stable schema names.
       * @example {
       *       "masked": "os_analytics",
       *       "pii": "os_analytics_pii"
       *     }
       */
      schemas: {
        /**
         * @description Masked schema.
         * @example os_analytics
         */
        masked: string
        /**
         * @description Unmasked schema.
         * @example os_analytics_pii
         */
        pii: string
      }
      /**
       * @description Views in your scope.
       * @example []
       */
      views: components['schemas']['SqlAccessCatalogView'][]
    }
    /** @description One SQL view. */
    SqlAccessCatalogView: {
      /**
       * @description View name.
       * @example crm_contacts
       */
      name: string
      /**
       * @description `resource` or `system`.
       * @example resource
       */
      kind: string
      /**
       * @description Vertical.
       * @example crm
       */
      vertical?: string
      /**
       * @description Resource type.
       * @example contacts
       */
      resourceType?: string
      /**
       * @description Columns in order.
       * @example []
       */
      columns: components['schemas']['SqlAccessCatalogColumn'][]
    }
    /** @description One column of a SQL view. */
    SqlAccessCatalogColumn: {
      /**
       * @description Column name.
       * @example email
       */
      name: string
      /**
       * @description `store` (row metadata), `field` (a record field) or `data` (the whole record).
       * @example field
       */
      source: string
      /**
       * @description Record field read.
       * @example email
       */
      field?: string
      /**
       * @description Type in the unmasked views.
       * @example text
       */
      type: string
      /**
       * @description Type in the masked views.
       * @example text
       */
      maskedType: string
      /**
       * @description Classification: `public`, `internal`, `pii`, `financial` or `secret`.
       * @example pii
       */
      class: string
      /**
       * @description Mask in the masked views.
       * @example email
       */
      mask?: string
    }
    /** @description A read-only SQL login. Never carries its password. */
    SqlPrincipal: {
      /**
       * @description Principal id.
       * @example 3f9a1c2b-4d5e-4f60-8a7b-1c2d3e4f5a6b
       */
      id: string
      /**
       * @description Postgres login name.
       * @example os_sql_metabase_prod_3f9a1c
       */
      username: string
      /**
       * @description Label.
       * @example Metabase prod
       */
      label: string
      /**
       * @description Reads the unmasked schema.
       * @example false
       */
      pii: boolean
      scope: components['schemas']['SqlPrincipalScope']
      /**
       * @description Concurrent sessions allowed.
       * @example 5
       */
      connectionLimit: number
      /**
       * @description User id that created it.
       * @example b3c4d5e6-0000-4000-8000-000000000001
       */
      createdBy: string | null
      /**
       * @description Created (ISO 8601).
       * @example 2026-09-29T12:00:00.000Z
       */
      createdAt: string
      /**
       * @description Login expiry (ISO 8601); null for never.
       * @example null
       */
      expiresAt: string | null
      /**
       * @description When it was revoked (ISO 8601).
       * @example null
       */
      revokedAt: string | null
      /**
       * @description Last password rotation (ISO 8601).
       * @example null
       */
      lastRotatedAt: string | null
      /**
       * @description `active`, `expired` or `revoked`.
       * @example active
       */
      status: string
      /**
       * @description Schema the login reads by default.
       * @example os_analytics
       */
      searchPath: string
    }
    /** @description What a SQL principal may read. */
    SqlPrincipalScope: {
      /**
       * @description Owner tenants the login sees, or `*` for every tenant.
       * @example [
       *       "acme"
       *     ]
       */
      tenants: '*' | string[]
      /**
       * @description Verticals the login sees; omitted or `*` for all.
       * @example [
       *       "crm"
       *     ]
       */
      verticals?: '*' | string[]
    }
    /** @description A principal with its one-time password. */
    SqlPrincipalWithPassword: {
      principal: components['schemas']['SqlPrincipal']
      /**
       * @description The password. Shown once, never stored — rotate if lost.
       * @example k3JqT9…
       */
      password: string
      connection: components['schemas']['SqlPrincipalConnection']
      /**
       * @description Provisioning mode.
       * @example managed
       * @enum {string}
       */
      mode: 'managed' | 'manual'
      /**
       * @description Open sessions ended (rotate only); null when unknown.
       * @example 0
       */
      sessionsTerminated?: number | null
      /**
       * @description Manual mode: SQL an operator must run to apply the change. Holds only the SCRAM verifier, not the password.
       * @example BEGIN; … COMMIT;
       */
      script?: string
    }
    /** @description How to connect as a principal. */
    SqlPrincipalConnection: {
      /**
       * @description Advertised host (`ANALYTICS_READ_HOST`); null when unset — use the database host.
       * @example replica.internal
       */
      host: string | null
      /**
       * @description Login name.
       * @example os_sql_metabase_prod_3f9a1c
       */
      username: string
      /**
       * @description Default schema.
       * @example os_analytics
       */
      searchPath: string
    }
    /** @description Outcome of revoking a principal. */
    SqlPrincipalRevokeResult: {
      principal: components['schemas']['SqlPrincipal']
      /**
       * @description Provisioning mode.
       * @example managed
       * @enum {string}
       */
      mode: 'managed' | 'manual'
      /**
       * @description Open sessions ended; null when unknown.
       * @example 0
       */
      sessionsTerminated: number | null
      /**
       * @description Manual mode: SQL an operator must run to apply the revoke.
       * @example BEGIN; … COMMIT;
       */
      script?: string
    }
    /** @description Tenant (and optionally verticals) a scoped user may see. */
    ScopeGrantOutput: {
      /**
       * @description Tenant the grant covers.
       * @example acme
       */
      tenantId: string
      /**
       * @description Verticals within the tenant: `*` for every vertical, or a list.
       * @example *
       */
      verticals: '*' | string[]
    }
    /** @description Personally identifiable information for an end-user; only returned when explicitly requested. */
    EndUserPiiOutput: {
      /**
       * @description End-user's given name.
       * @example Jane
       */
      firstName?: string
      /**
       * @description End-user's family name.
       * @example Doe
       */
      lastName?: string
      /**
       * @description National/tax identifier; typically masked in responses.
       * @example ***-**-1234
       */
      personalIdNumber?: string
      /**
       * @description Contact phone number in E.164 or local format.
       * @example +1-415-555-0142
       */
      phone?: string
      /** @description End-user's postal address. */
      address?: components['schemas']['EndUserAddressOutput']
    }
    /** @description Postal address for an end-user, stored as part of their PII. */
    EndUserAddressOutput: {
      /**
       * @description First line of the street address.
       * @example 2500 Market Street
       */
      line1?: string
      /**
       * @description Second address line (suite, unit, etc.).
       * @example Suite 300
       */
      line2?: string
      /**
       * @description City or locality.
       * @example San Francisco
       */
      city?: string
      /**
       * @description State, province, or region.
       * @example CA
       */
      region?: string
      /**
       * @description Postal or ZIP code.
       * @example 94114
       */
      postalCode?: string
      /**
       * @description Country, typically an ISO 3166-1 alpha-2 code.
       * @example US
       */
      country?: string
    }
    /** @description A specific vertical+platform the customer is permitted to connect through a link. */
    AllowedPlatformOutput: {
      /**
       * @description Vertical the allowed platform belongs to.
       * @example accounting
       */
      vertical: string
      /**
       * @description Slug of the platform the customer is allowed to connect.
       * @example xero
       */
      slug: string
    }
    /** @description One chart on a dashboard. `chart` must be one of its metric's `charts` (`400` otherwise). */
    DashboardWidgetOutput: {
      /**
       * @description Metric id from the catalog.
       * @example ecommerce.orders_per_day
       */
      metricId: string
      /**
       * @description Heading shown on the widget; defaults to the metric title.
       * @example Orders (last 30 days)
       */
      title?: string
      chart: components['schemas']['DashboardChart']
      /**
       * @description Width in grid columns, out of 12.
       * @example 6
       */
      width: number
      /**
       * @description Pin the widget to one currency (ISO 4217). Absent or null follows the dashboard view's currency filter; with no filter every currency is drawn separately. Metrics without money or a currency field ignore it.
       * @example EUR
       */
      currency?: string | null
      granularity?: components['schemas']['MetricGranularityParam']
      /**
       * @description Also compute the prior equal-length period; number and gauge charts show the change. Only metrics marked `comparable` use it.
       * @example true
       */
      compare?: boolean
    }
    /** @description Which records a destination exports. Must lie inside your own tenant (and vertical) scope. */
    DestinationScopeOutput: {
      /**
       * @description Owner tenants whose connections are exported, or `*` for every tenant (the only value that also exports connections with no owner tenant).
       * @example [
       *       "acme"
       *     ]
       */
      tenants: '*' | string[]
      /**
       * @description Verticals exported, each with `*` or a list of resource types. Omit to export every vertical.
       * @example {
       *       "crm": "*",
       *       "ecommerce": [
       *         "orders"
       *       ]
       *     }
       */
      verticals?: {
        [key: string]: '*' | string[]
      }
      /**
       * @description Also mask financial fields (amounts, balances).
       * @example false
       */
      maskFinancial?: boolean
    }
  }
  responses: never
  parameters: never
  requestBodies: never
  headers: never
  pathItems: never
}
export type $defs = Record<string, never>
export interface operations {
  'auth.login': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** @description Credentials for local username/password login. */
    requestBody: {
      content: {
        'application/json': components['schemas']['LoginBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['AuthTokenResponse']
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      429: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'auth.hasUsers': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['HasUsersResponse']
        }
      }
    }
  }
  'auth.setup': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** @description Credentials to bootstrap the first admin account on a fresh deployment. */
    requestBody: {
      content: {
        'application/json': components['schemas']['SetupBody']
      }
    }
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['AuthTokenResponse']
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'auth.me': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['MeResponse']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'users.list': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['User'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'users.create': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** @description Request body to create an admin-console user. */
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateUserBody']
      }
    }
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['CreatedUser']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'users.get': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['UserDetail']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'users.delete': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'users.update': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    /** @description Request body to update a console account. */
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateUserBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['User']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'users.avatar.put': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    /** @description A profile picture to store for a console user. */
    requestBody: {
      content: {
        'application/json': components['schemas']['PutUserAvatarBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['UserAvatar']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      413: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      415: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'users.avatar.delete': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'permissions.list': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['PermissionInfo'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'roles.list': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['RoleDefinition'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'roles.create': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** @description Request body to create a custom role. */
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateRoleBody']
      }
    }
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['RoleDefinition']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'roles.get': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['RoleDefinition']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'roles.delete': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'roles.update': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    /** @description Request body to edit a custom role; omitted fields are unchanged. */
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateRoleBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['RoleDefinition']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'users.role.assign': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    /** @description Request body to assign a role to a console user. */
    requestBody: {
      content: {
        'application/json': components['schemas']['AssignUserRoleBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['User']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'users.scope.update': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    /** @description Request body to set a console user's tenant scope. */
    requestBody: {
      content: {
        'application/json': components['schemas']['SetUserScopeBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['UserScope']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'verticals.list': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['VerticalHealth'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'connections.list': {
    parameters: {
      query?: {
        vertical?: components['schemas']['Vertical']
        status?: string
        platform?: string
        /** @description Case-insensitive substring match against the connection id and label. An id prefix is enough, which is what an operator pastes from a support ticket or a `?connection_id=` call. */
        search?: string
        page?: string
        limit?: string
        /** @description Column to order by: one of `label`, `id`, `vertical`, `platform`, `status`, `tenant`, `created`. An unrecognised value is ignored and the default order (most recently updated first) is used. */
        sort?: string | string[]
        /** @description Sort direction: `asc` or `desc`. Any other value (including omitted) is ascending. */
        dir?: string | string[]
        /** @description Case-insensitive substring match against the label. */
        f_label?: string | string[]
        /** @description Case-insensitive substring match against the connection id. */
        f_id?: string | string[]
        /** @description Exact match against the vertical. */
        f_vertical?: string | string[]
        /** @description Exact match against the connection status. */
        f_status?: string | string[]
        /** @description Case-insensitive substring match against the platform slug. */
        f_platform?: string | string[]
        /** @description Exact match against the tenant id. */
        f_tenant?: string | string[]
      }
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['Connection'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'connections.get': {
    parameters: {
      query?: never
      header?: never
      path: {
        /** @description One of the nine verticals OpenSteward maps to a canonical API. */
        vertical:
          | 'accounting'
          | 'crm'
          | 'ecommerce'
          | 'logistics'
          | 'payments'
          | 'docsign'
          | 'projects'
          | 'customer-support'
          | 'inventory'
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['Connection']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'connections.delete': {
    parameters: {
      query?: never
      header?: never
      path: {
        /** @description One of the nine verticals OpenSteward maps to a canonical API. */
        vertical:
          | 'accounting'
          | 'crm'
          | 'ecommerce'
          | 'logistics'
          | 'payments'
          | 'docsign'
          | 'projects'
          | 'customer-support'
          | 'inventory'
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'connections.update': {
    parameters: {
      query?: never
      header?: never
      path: {
        /** @description One of the nine verticals OpenSteward maps to a canonical API. */
        vertical:
          | 'accounting'
          | 'crm'
          | 'ecommerce'
          | 'logistics'
          | 'payments'
          | 'docsign'
          | 'projects'
          | 'customer-support'
          | 'inventory'
        id: string
      }
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': {
          /**
           * @description New human-friendly name for the connection. `null` clears it. Labels are unique per tenant and platform, so reusing one answers `409`.
           * @example Acme production books
           */
          label: string | null
        }
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['Connection']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'connections.setSyncSchedule': {
    parameters: {
      query?: never
      header?: never
      path: {
        /** @description One of the nine verticals OpenSteward maps to a canonical API. */
        vertical:
          | 'accounting'
          | 'crm'
          | 'ecommerce'
          | 'logistics'
          | 'payments'
          | 'docsign'
          | 'projects'
          | 'customer-support'
          | 'inventory'
        id: string
      }
      cookie?: never
    }
    /** @description How often a connection's data is re-synced. `default` follows the deployment interval (runtime setting `data_store.sync.default_interval_minutes`); `custom` uses `intervalMinutes` (15–43200); `trigger_only` never syncs automatically, not even when connected; `once` syncs once when connected. */
    requestBody: {
      content: {
        'application/json': components['schemas']['ConnectionSyncSchedule']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['Connection']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'notifications.list': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['Notification'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'notifications.unread-count': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['UnreadNotificationCount']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'notifications.acknowledge': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'notifications.acknowledge-all': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'audit.actions': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content?: never
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'audit.list': {
    parameters: {
      query?: {
        page?: string | string[]
        limit?: string | string[]
        action?: string | string[]
        user_id?: string | string[]
        target_id?: string | string[]
        from?: string | string[]
        to?: string | string[]
        /** @description Column to order by: one of `time`, `user`, `action`, `vertical`, `target`. An unrecognised value is ignored and the default order (newest first) is used. `user` orders by the stored `user_id`, not the username resolved for display. */
        sort?: string | string[]
        /** @description Sort direction: `asc` or `desc`. Any other value (including omitted) is ascending. */
        dir?: string | string[]
        /** @description Case-insensitive substring match against the vertical the action touched. */
        vertical?: string | string[]
      }
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['AuditEntry'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'audit.export': {
    parameters: {
      query?: {
        page?: string | string[]
        limit?: string | string[]
        action?: string | string[]
        user_id?: string | string[]
        target_id?: string | string[]
        from?: string | string[]
        to?: string | string[]
        /** @description Column to order by: one of `time`, `user`, `action`, `vertical`, `target`. An unrecognised value is ignored and the default order (newest first) is used. `user` orders by the stored `user_id`, not the username resolved for display. */
        sort?: string | string[]
        /** @description Sort direction: `asc` or `desc`. Any other value (including omitted) is ascending. */
        dir?: string | string[]
        /** @description Case-insensitive substring match against the vertical the action touched. */
        vertical?: string | string[]
        format?: ('csv' | 'json') | ('csv' | 'json')[]
      }
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'platforms.list': {
    parameters: {
      query?: {
        vertical?: components['schemas']['Vertical']
        search?: string
      }
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['Platform'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'platforms.list-status': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['PlatformOperatorRow'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      502: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'platforms.list-by-vertical': {
    parameters: {
      query?: never
      header?: never
      path: {
        /** @description One of the nine verticals OpenSteward maps to a canonical API. */
        vertical:
          | 'accounting'
          | 'crm'
          | 'ecommerce'
          | 'logistics'
          | 'payments'
          | 'docsign'
          | 'projects'
          | 'customer-support'
          | 'inventory'
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['PlatformOperatorRow'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      502: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'platforms.config.get': {
    parameters: {
      query?: never
      header?: never
      path: {
        /** @description One of the nine verticals OpenSteward maps to a canonical API. */
        vertical:
          | 'accounting'
          | 'crm'
          | 'ecommerce'
          | 'logistics'
          | 'payments'
          | 'docsign'
          | 'projects'
          | 'customer-support'
          | 'inventory'
        /** @description Adapter slug identifying an upstream platform, e.g. `fortnox`. See GET /api/platforms. */
        slug: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['PlatformConfigRedacted']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      502: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'platforms.config.set': {
    parameters: {
      query?: never
      header?: never
      path: {
        /** @description One of the nine verticals OpenSteward maps to a canonical API. */
        vertical:
          | 'accounting'
          | 'crm'
          | 'ecommerce'
          | 'logistics'
          | 'payments'
          | 'docsign'
          | 'projects'
          | 'customer-support'
          | 'inventory'
        /** @description Adapter slug identifying an upstream platform, e.g. `fortnox`. See GET /api/platforms. */
        slug: string
      }
      cookie?: never
    }
    /** @description Request body to merge keys into an operator platform configuration. Omitted keys keep their stored value; `null` clears a key. */
    requestBody: {
      content: {
        'application/json': components['schemas']['PlatformConfigSetBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            /** @constant */
            ok: true
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      502: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'platforms.enable': {
    parameters: {
      query?: never
      header?: never
      path: {
        /** @description One of the nine verticals OpenSteward maps to a canonical API. */
        vertical:
          | 'accounting'
          | 'crm'
          | 'ecommerce'
          | 'logistics'
          | 'payments'
          | 'docsign'
          | 'projects'
          | 'customer-support'
          | 'inventory'
        /** @description Adapter slug identifying an upstream platform, e.g. `fortnox`. See GET /api/platforms. */
        slug: string
      }
      cookie?: never
    }
    /** @description Request body to enable a platform for a vertical, optionally supplying its config. */
    requestBody: {
      content: {
        'application/json': components['schemas']['PlatformEnableBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            /** @constant */
            ok: true
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      502: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'platforms.disable': {
    parameters: {
      query?: never
      header?: never
      path: {
        /** @description One of the nine verticals OpenSteward maps to a canonical API. */
        vertical:
          | 'accounting'
          | 'crm'
          | 'ecommerce'
          | 'logistics'
          | 'payments'
          | 'docsign'
          | 'projects'
          | 'customer-support'
          | 'inventory'
        /** @description Adapter slug identifying an upstream platform, e.g. `fortnox`. See GET /api/platforms. */
        slug: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            /** @constant */
            ok: true
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      502: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'company-info.get': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['CompanyInfoRecord'] | null
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'company-info.update': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** @description Editable company/branding fields accepted when updating company info. */
    requestBody: {
      content: {
        'application/json': components['schemas']['CompanyInfoInput']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['CompanyInfoRecord']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'company-info.reset': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'company-info.get-public': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['PublicCompanyInfo']
          }
        }
      }
    }
  }
  'end-users.list': {
    parameters: {
      query?: {
        tenantId?: string | string[]
        q?: string | string[]
        limit?: string | string[]
        offset?: string | string[]
        page?: string | string[]
        /** @description Column to order by: one of `email`, `displayName`, `externalReference`, `tenantId`, `created`. An unrecognised value is ignored and the default order (most recently created first) is used. */
        sort?: string | string[]
        /** @description Sort direction: `asc` or `desc`. Any other value (including omitted) is ascending. */
        dir?: string | string[]
        /** @description Case-insensitive substring match against the email address. */
        email?: string | string[]
        /** @description Case-insensitive substring match against the display name. */
        displayName?: string | string[]
        /** @description Case-insensitive substring match against the external reference. */
        externalReference?: string | string[]
      }
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['EndUserSummary'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'end-users.create': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** @description Request body to create an end-user. */
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateEndUserBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['EndUserSummary']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'end-users.get': {
    parameters: {
      query?: {
        include_pii?: string | string[]
      }
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['EndUserDetail']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'end-users.delete': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'end-users.update': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    /** @description Request body to update an end-user; omitted fields are left unchanged. */
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateEndUserBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['EndUserSummary']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'connect-sessions.list': {
    parameters: {
      query?: {
        tenantId?: string
        endUserId?: string
        status?: components['schemas']['ConnectSessionStatus']
        limit?: string
        offset?: string
      }
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['ConnectSession'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'connect-sessions.create': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** @description Request body to create a connect session / shareable connect link. */
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateConnectSessionBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['ConnectSession']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'connect-sessions.get': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['ConnectSession']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'connect-sessions.delete': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'api-keys.list': {
    parameters: {
      query?: {
        tenantId?: string
        mode?: 'live' | 'test'
      }
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['ApiKey'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'api-keys.create': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** @description Request body to mint a new tenant API key. */
    requestBody: {
      content: {
        'application/json': components['schemas']['MintApiKeyBody']
      }
    }
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['ApiKeyMint']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'api-keys.rotate': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    /** @description Request body to rotate a tenant API key. */
    requestBody: {
      content: {
        'application/json': components['schemas']['RotateApiKeyBody']
      }
    }
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['ApiKeyRotate']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'api-keys.delete': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'oauth-clients.listIssuers': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['OAuthIssuer'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'oauth-clients.createIssuer': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** @description Register an identity provider whose tokens the developer API accepts. */
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateOAuthIssuerBody']
      }
    }
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['OAuthIssuer']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'oauth-clients.readiness': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['OAuthReadiness']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'oauth-clients.listPresets': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['OAuthPreset'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'oauth-clients.getIssuer': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['OAuthIssuerDetail']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'oauth-clients.deleteIssuer': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'oauth-clients.updateIssuer': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    /** @description Fields to change. The merged row is validated, not the patch — switching to external authority without naming a tenant claim is refused here rather than failing open at request time. */
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateOAuthIssuerBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['OAuthIssuer']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'oauth-clients.discover': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** @description Read an issuer's OpenID discovery document without saving anything. */
    requestBody: {
      content: {
        'application/json': components['schemas']['DiscoverOAuthIssuerBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['OAuthDiscovery']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'oauth-clients.createClient': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    /** @description Register a service account against an issuer. */
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateOAuthClientBody']
      }
    }
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['OAuthClient']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'oauth-clients.revokeClient': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'oauth-clients.createScopeRule': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    /** @description Map one of the IdP's scope values onto an OpenSteward scope. */
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateOAuthScopeRuleBody']
      }
    }
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['OAuthScopeRule']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'oauth-clients.deleteScopeRule': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'end-user-tokens.list': {
    parameters: {
      query?: {
        endUserId?: string
        tenantId?: string
      }
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['EndUserToken'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'end-user-tokens.create': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** @description Request body to mint an API token scoped to a single end-user. */
    requestBody: {
      content: {
        'application/json': components['schemas']['MintEndUserTokenBody']
      }
    }
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['EndUserTokenMint']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'end-user-tokens.delete': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'webhook-subs.list': {
    parameters: {
      query?: {
        tenantId?: string
        /** @description Case-insensitive substring match over the subscription label and URL. Applied server-side over the whole set, so a match is found regardless of where the row sits in the list. */
        search?: string
      }
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['WebhookSubscription'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'webhook-subs.create': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** @description Request body to create a webhook subscription. The signing secret is returned once in the response. */
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateWebhookSubscriptionBody']
      }
    }
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['WebhookSubscriptionWithSecret']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'webhook-subs.delete': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'webhook-subs.update': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    /** @description Request body to change a webhook subscription's label or delivery settings. The URL and event list are immutable. */
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateWebhookSubscriptionBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['WebhookSubscription']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'webhook-subs.pause': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': {
          paused?: boolean
        }
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: {
              id: string
              paused: boolean
            }
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'webhook-subs.test': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['WebhookTestResult']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'webhook-subs.rotate-secret': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: {
              id: string
              secret: string
            }
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'webhook-subs.deliveries.list': {
    parameters: {
      query?: {
        /** @description Filter by delivery status: `pending`, `delivered` or `dead`. An unrecognised value is ignored and no status filter is applied. */
        status?: string | string[]
        limit?: string | string[]
        page?: string | string[]
        /** @description Column to order by: one of `eventType`, `eventId`, `status`, `attempts`. An unrecognised value is ignored and the default order (most recent first) is used. */
        sort?: string | string[]
        /** @description Sort direction: `asc` or `desc`. Any other value (including omitted) is ascending. */
        dir?: string | string[]
        /** @description Case-insensitive substring match against the event type. */
        eventType?: string | string[]
        /** @description Case-insensitive substring match against the event id. */
        eventId?: string | string[]
      }
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['WebhookDelivery'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'webhook-subs.deliveries.replay': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
        deliveryId: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      202: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['WebhookDelivery']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'sync-jobs.list': {
    parameters: {
      query?: {
        vertical?: components['schemas']['Vertical']
        connection_id?: string | string[]
        status?: components['schemas']['SyncJobStatus']
        limit?: string | string[]
        page?: string | string[]
        /** @description Column to order by: one of `vertical`, `platform`, `connection`, `tenant`, `status`, `created`. An unrecognised value is ignored and the default order (newest first) is used. */
        sort?: string | string[]
        /** @description Sort direction: `asc` or `desc`. Any other value (including omitted) is ascending. */
        dir?: string | string[]
        /** @description Case-insensitive substring match against the platform slug. */
        platform?: string | string[]
        /** @description Exact match against the connection's owning tenant id. */
        tenant_id?: string | string[]
        /** @description Case-insensitive substring match against the sync job id. */
        id?: string | string[]
        /** @description Case-insensitive substring match against the connection id. Distinct from `connection_id`, which is an exact match: the admin table filters on a prefix of the id its Connection cell shows. */
        connection_id_contains?: string | string[]
      }
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['SyncJob'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'sync-jobs.create': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** @description Request body to enqueue a data-sync job for a connection. */
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateSyncJobBody']
      }
    }
    responses: {
      /** @description Default Response */
      202: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['SyncJob']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      500: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      502: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'sync-jobs.get': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['SyncJob']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'sync-jobs.cancel': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['SyncJob']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'sync-jobs.metrics': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['DataStoreMetrics'] | null
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'scope-groups.list': {
    parameters: {
      query?: {
        vertical?: components['schemas']['Vertical']
        platform?: string
      }
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['ScopeGroup'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'scope-groups.create': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** @description Request body to create a named scope group. */
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateScopeGroupBody']
      }
    }
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['ScopeGroup']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      500: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'scope-groups.update': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    /** @description Request body to update a scope group; omitted fields are left unchanged. */
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateScopeGroupBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['ScopeGroup']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'scope-groups.delete': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'connect-link-templates.list': {
    parameters: {
      query?: {
        tenantId?: string
      }
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['ConnectLinkTemplate'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'connect-link-templates.create': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** @description Request body to create a connect-link template. */
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateConnectLinkTemplateBody']
      }
    }
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['ConnectLinkTemplate']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      500: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'connect-link-templates.get': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['ConnectLinkTemplate']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'connect-link-templates.update': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    /** @description Request body to update a connect-link template; omitted fields are left unchanged. */
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateConnectLinkTemplateBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['ConnectLinkTemplate']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'connect-link-templates.delete': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'tenant-domains.get-public': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['TenantDomainMapEntry'][]
          }
        }
      }
    }
  }
  'tenants.list': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['Tenant'][]
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'tenants.create': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** @description Request body to register a new tenant. */
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateTenantBody']
      }
    }
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['Tenant']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'tenants.update': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    /** @description Request body to rename a tenant. */
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateTenantBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['Tenant']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'tenants.delete': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'tenant-domains.list': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['TenantDomain'][]
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'tenant-domains.create': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** @description Request body to attach a custom domain to a tenant. */
    requestBody: {
      content: {
        'application/json': components['schemas']['AddTenantDomainBody']
      }
    }
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['TenantDomain']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'tenant-domains.delete': {
    parameters: {
      query?: never
      header?: never
      path: {
        domain: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'dashboard-tasks.list-dismissals': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['DashboardDismissal'][]
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'dashboard-tasks.dismiss': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** @description Request body to clear dashboard tasks. */
    requestBody: {
      content: {
        'application/json': components['schemas']['DismissDashboardTasksBody']
      }
    }
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'dashboard-tasks.undismiss': {
    parameters: {
      query?: never
      header?: never
      path: {
        /** @description Task key to un-clear (URL-encode it: keys contain `:` and may contain `/`). */
        key: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'runtime-settings.list': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['RuntimeSetting'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'runtime-settings.reset': {
    parameters: {
      query?: never
      header?: never
      path: {
        /** @description Runtime-setting key — one of the seeded inventory. */
        key:
          | 'rate_limit.api_key.per_minute'
          | 'rate_limit.api_key.window_ms'
          | 'rate_limit.mcp_tenant.per_minute'
          | 'rate_limit.mcp_end_user.per_minute'
          | 'rate_limit.connect_link.per_minute'
          | 'features.mcp_enabled'
          | 'features.end_user_mode_enabled'
          | 'features.test_mode_enabled'
          | 'connect_link.default_expiry_hours'
          | 'connect_link.one_time_default'
          | 'auth.local_login_enabled'
          | 'auth.break_glass_user_id'
          | 'auth.dev_api_keys_enabled'
          | 'auth.dev_oauth_enabled'
          | 'auth.sandbox_self_serve_enabled'
          | 'data_store.raw_payload.payments'
          | 'data_store.raw_payload.accounting'
          | 'data_store.sync.default_interval_minutes'
          | 'data_store.sync.scheduler_enabled'
          | 'data_access.mask_financial'
          | 'webhooks.delivery_retention_days'
          | 'webhooks.inbound_event_retention_days'
          | 'audit_log.retention_days'
          | 'openapi.servers.scheme'
          | 'openapi.servers.host'
          | 'openapi.servers.port'
          | 'openapi.servers.version'
          | 'logos.source'
          | 'logos.brandfetch_client_id'
          | 'logos.fetch_delay_ms'
          | 'logos.job_retention_days'
          | 'logos.fetch_referer'
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['RuntimeSetting']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'runtime-settings.update': {
    parameters: {
      query?: never
      header?: never
      path: {
        /** @description Runtime-setting key — one of the seeded inventory. */
        key:
          | 'rate_limit.api_key.per_minute'
          | 'rate_limit.api_key.window_ms'
          | 'rate_limit.mcp_tenant.per_minute'
          | 'rate_limit.mcp_end_user.per_minute'
          | 'rate_limit.connect_link.per_minute'
          | 'features.mcp_enabled'
          | 'features.end_user_mode_enabled'
          | 'features.test_mode_enabled'
          | 'connect_link.default_expiry_hours'
          | 'connect_link.one_time_default'
          | 'auth.local_login_enabled'
          | 'auth.break_glass_user_id'
          | 'auth.dev_api_keys_enabled'
          | 'auth.dev_oauth_enabled'
          | 'auth.sandbox_self_serve_enabled'
          | 'data_store.raw_payload.payments'
          | 'data_store.raw_payload.accounting'
          | 'data_store.sync.default_interval_minutes'
          | 'data_store.sync.scheduler_enabled'
          | 'data_access.mask_financial'
          | 'webhooks.delivery_retention_days'
          | 'webhooks.inbound_event_retention_days'
          | 'audit_log.retention_days'
          | 'openapi.servers.scheme'
          | 'openapi.servers.host'
          | 'openapi.servers.port'
          | 'openapi.servers.version'
          | 'logos.source'
          | 'logos.brandfetch_client_id'
          | 'logos.fetch_delay_ms'
          | 'logos.job_retention_days'
          | 'logos.fetch_referer'
      }
      cookie?: never
    }
    /** @description PATCH body for /api/runtime-settings/{key}. Discriminated on `key`, one branch per value shape, so the `value` field is typed as number / boolean / string / a closed vocabulary / unknown for JSON. */
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateRuntimeSettingBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['RuntimeSetting']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'logo-fetch.list': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['LogoFetchJob'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'logo-fetch.start': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': {
          /**
           * @description Refetch logos that are already stored instead of skipping them.
           * @example false
           */
          force?: boolean
          /**
           * @description Limit the fetch to one vertical.
           * @example accounting
           */
          vertical?: string
          /**
           * @description Limit the fetch to a single platform.
           * @example xero
           */
          slug?: string
        }
      }
    }
    responses: {
      /** @description Default Response */
      202: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['LogoFetchJob']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'logo-fetch.get': {
    parameters: {
      query?: never
      header?: never
      path: {
        /** @description Logo-fetch job identifier. */
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['LogoFetchJob']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'logo-fetch.cancel': {
    parameters: {
      query?: never
      header?: never
      path: {
        /** @description Logo-fetch job identifier. */
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['LogoFetchJob']
          }
        }
      }
      /** @description Default Response */
      202: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['LogoFetchJob']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'logos.status': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['LogoStatus']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'logos.purge': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['LogoPurgeResult']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'identity-providers.list': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['IdentityProvider'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'identity-providers.create': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** @description Create an identity provider. Body is keyed by `protocol` — OIDC, SAML, and LDAP each pin the per-protocol config shape. */
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateIdentityProviderBody']
      }
    }
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['IdentityProvider']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'identity-providers.get': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['IdentityProvider']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'identity-providers.update': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    /** @description Request body to update an identity provider; omitted fields are left unchanged. Protocol is immutable. */
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateIdentityProviderBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['IdentityProvider']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'identity-providers.delete': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'identity-providers.metadata': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': string
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'identity-providers.role-mappings.list': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['RoleMappingRule'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'identity-providers.role-mappings.create': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    /** @description Request body to create a role-mapping rule for an identity provider. */
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateRoleMappingRuleBody']
      }
    }
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['RoleMappingRule']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'identity-providers.role-mappings.delete': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
        ruleId: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'identity-providers.scope-rules.list': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['ScopeMappingRule'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'identity-providers.scope-rules.create': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    /** @description Request body to create a scope-mapping rule for an identity provider. */
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateScopeMappingRuleBody']
      }
    }
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['ScopeMappingRule']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'identity-providers.scope-rules.delete': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
        ruleId: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'identity-providers.default-scope.update': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    /** @description Request body to set an identity provider's default tenant scope. */
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateIdpDefaultScopeBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['IdentityProvider']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'identity-providers.scim-tokens.list': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['ScimToken'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'identity-providers.scim-tokens.create': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    /** @description Request body to mint a SCIM provisioning token for an identity provider. */
    requestBody: {
      content: {
        'application/json': components['schemas']['MintScimTokenBody']
      }
    }
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['ScimTokenMint']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'identity-providers.scim-tokens.delete': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
        tokenId: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'sso.login-options': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['LoginOptions']
          }
        }
      }
    }
  }
  'sso.login': {
    parameters: {
      query?: {
        return_to?: string
      }
      header?: never
      path: {
        slug: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      302: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': string
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      502: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'sso.callback': {
    parameters: {
      query?: {
        state?: string
      }
      header?: never
      path: {
        slug: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      302: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': string
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'sso.acs': {
    parameters: {
      query?: never
      header?: never
      path: {
        slug: string
      }
      cookie?: never
    }
    /** @description Form body the IdP POSTs to the SAML Assertion Consumer Service endpoint. */
    requestBody: {
      content: {
        'application/json': components['schemas']['SamlAcsBody']
      }
    }
    responses: {
      /** @description Default Response */
      302: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': string
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      500: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'sso.ldap-login': {
    parameters: {
      query?: never
      header?: never
      path: {
        slug: string
      }
      cookie?: never
    }
    /** @description Credentials submitted to authenticate against an LDAP identity provider. */
    requestBody: {
      content: {
        'application/json': components['schemas']['LdapLoginBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['AuthTokenResponse']
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'sso.handoff.exchange': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** @description Body carrying the one-time SSO handoff code to exchange for a bearer token. */
    requestBody: {
      content: {
        'application/json': components['schemas']['SsoHandoffBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['AuthTokenResponse']
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'scim.service-provider-config': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ScimResource']
        }
      }
    }
  }
  'scim.users.list': {
    parameters: {
      query?: {
        filter?: string
        startIndex?: string
        count?: string
      }
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ScimResource']
        }
      }
    }
  }
  'scim.users.create': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** @description A SCIM 2.0 resource (User or Group); an open object whose fields follow the SCIM schema for the endpoint. */
    requestBody: {
      content: {
        'application/json': components['schemas']['ScimResource']
      }
    }
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ScimResource']
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ScimResource']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ScimResource']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ScimResource']
        }
      }
    }
  }
  'scim.users.get': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ScimResource']
        }
      }
    }
  }
  'scim.users.replace': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    /** @description A SCIM 2.0 resource (User or Group); an open object whose fields follow the SCIM schema for the endpoint. */
    requestBody: {
      content: {
        'application/json': components['schemas']['ScimResource']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ScimResource']
        }
      }
    }
  }
  'scim.users.delete': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
    }
  }
  'scim.users.patch': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    /** @description A SCIM 2.0 resource (User or Group); an open object whose fields follow the SCIM schema for the endpoint. */
    requestBody: {
      content: {
        'application/json': components['schemas']['ScimResource']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ScimResource']
        }
      }
    }
  }
  'scim.groups.list': {
    parameters: {
      query?: {
        filter?: string
        startIndex?: string
        count?: string
      }
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ScimResource']
        }
      }
    }
  }
  'scim.groups.create': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** @description A SCIM 2.0 resource (User or Group); an open object whose fields follow the SCIM schema for the endpoint. */
    requestBody: {
      content: {
        'application/json': components['schemas']['ScimResource']
      }
    }
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ScimResource']
        }
      }
    }
  }
  'scim.groups.get': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ScimResource']
        }
      }
    }
  }
  'scim.groups.delete': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
    }
  }
  'scim.groups.patch': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    /** @description A SCIM 2.0 resource (User or Group); an open object whose fields follow the SCIM schema for the endpoint. */
    requestBody: {
      content: {
        'application/json': components['schemas']['ScimResource']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ScimResource']
        }
      }
    }
  }
  'schema-status.list': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['SchemaStatusEntry'][]
            meta: components['schemas']['PaginationMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'license.get': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['LicenseStatus']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      503: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'data.summary': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['DataConnectionSummary'][]
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'data.schema': {
    parameters: {
      query?: never
      header?: never
      path: {
        vertical: string
        type: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['DataSchema']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'data.records.list': {
    parameters: {
      query?: {
        /** @description Cursor from the previous page’s `meta.nextCursor`. */
        cursor?: string
        /** @description Page size, 1–200 (default 50). */
        limit?: string
        /** @description Sort key. */
        sort?: 'updated_at' | 'resource_id'
        /** @description Sort direction. */
        dir?: 'asc' | 'desc'
        /** @description JSON array of `{ path, op, value }` with `op` one of `eq`, `contains`, `gt`, `lt`, `is_null`. Only searchable fields (see the schema route) are accepted. */
        filters?: string
        /** @description Free-text search over the record id and every searchable field. */
        q?: string
      }
      header?: never
      path: {
        id: string
        type: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['DataRecord'][]
            meta: components['schemas']['DataRecordPageMeta']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'data.records.export': {
    parameters: {
      query?: {
        /** @description Sort key. */
        sort?: 'updated_at' | 'resource_id'
        /** @description Sort direction. */
        dir?: 'asc' | 'desc'
        /** @description JSON array of `{ path, op, value }` with `op` one of `eq`, `contains`, `gt`, `lt`, `is_null`. Only searchable fields (see the schema route) are accepted. */
        filters?: string
        /** @description Free-text search over the record id and every searchable field. */
        q?: string
        /** @description Export format (default `csv`). */
        format?: 'csv' | 'ndjson'
        /** @description Export personal data unmasked. Requires `data:read_pii`; audited. */
        include_pii?: 'true' | 'false'
      }
      header?: never
      path: {
        id: string
        type: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'data.records.get': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
        type: string
        rid: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['DataRecord']
            meta: components['schemas']['DataRecordMeta']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'data.records.reveal': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
        type: string
        rid: string
      }
      cookie?: never
    }
    /** @description Request body to reveal a stored record. */
    requestBody: {
      content: {
        'application/json': components['schemas']['DataRevealBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['DataRecord']
            meta: components['schemas']['DataRecordMeta']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'dashboards.list': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['Dashboard'][]
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'dashboards.create': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** @description Request body to create a dashboard. */
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateDashboardBody']
      }
    }
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['Dashboard']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'dashboards.metrics.list': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['MetricInfo'][]
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'dashboards.metrics.get': {
    parameters: {
      query?: {
        /** @description First day. */
        from?: string
        /** @description Last day. */
        to?: string
        /** @description The dashboard this widget belongs to: applies its pinned tenants (your scope ∩ its pins). 404 when you cannot see it. */
        dashboard?: string
        /** @description Keep only this currency (ISO 4217): money metrics keep its amounts, counts with a currency field count only its records, other metrics ignore it. */
        currency?: string
        granularity?: components['schemas']['MetricGranularityParam']
        /** @description `1` adds `previous`: the same metric over the prior equal-length range. */
        compare?: '0' | '1'
        connection?: string
        platform?: string
        vertical?: string
      }
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['MetricResult']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'dashboards.currencies.list': {
    parameters: {
      query?: {
        /** @description The dashboard this widget belongs to: applies its pinned tenants (your scope ∩ its pins). 404 when you cannot see it. */
        dashboard?: string
        connection?: string
        platform?: string
        vertical?: string
      }
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            /**
             * @description Currency codes, sorted; records without a currency are not listed.
             * @example [
             *       "EUR",
             *       "GBP",
             *       "USD"
             *     ]
             */
            data: string[]
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'dashboards.connections.list': {
    parameters: {
      query?: {
        vertical?: components['schemas']['Vertical']
        platform?: string
        /** @description Case-insensitive substring of the connection id or label; an exact id is listed first. */
        search?: string
        /** @description The dashboard this widget belongs to: applies its pinned tenants (your scope ∩ its pins). 404 when you cannot see it. */
        dashboard?: string
        /** @description How many connections to list: 1–200, default 50. */
        limit?: string
      }
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['DashboardConnections']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'dashboards.get': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['Dashboard']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'dashboards.delete': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'dashboards.update': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    /** @description Request body to edit a dashboard. */
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateDashboardBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['Dashboard']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'superset.status': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['SupersetStatus']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'superset.dashboards.list': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['SupersetDashboard'][]
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'superset.dashboards.update-sharing': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    /** @description Who sees an embedded Superset dashboard. */
    requestBody: {
      content: {
        'application/json': components['schemas']['SupersetSharingBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['SupersetDashboard']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'superset.guest-token.create': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** @description Request body to mint a guest token. */
    requestBody: {
      content: {
        'application/json': components['schemas']['SupersetGuestTokenBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['SupersetGuestToken']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      502: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'destinations.types': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['DestinationTypeInfo'][]
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'destinations.list': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['Destination'][]
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'destinations.create': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** @description Request body to create a destination. */
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateDestinationBody']
      }
    }
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['Destination']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'destinations.get': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['Destination']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'destinations.delete': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      204: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': null
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'destinations.update': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    /** @description Request body to change a destination. */
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateDestinationBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['Destination']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'destinations.credentials': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    /** @description Replace a destination's credentials. */
    requestBody: {
      content: {
        'application/json': components['schemas']['DestinationCredentialsBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['Destination']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'destinations.test': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['DestinationTestResult']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'destinations.run': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      202: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['DestinationRunStarted']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'destinations.backfill': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    /** @description Request body to backfill a destination. */
    requestBody: {
      content: {
        'application/json': components['schemas']['DestinationBackfillBody']
      }
    }
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['DestinationBackfillResult']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'destinations.runs': {
    parameters: {
      query?: {
        /** @description How many runs, newest first, 1–500 (default 50). */
        limit?: string
      }
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['DestinationRun'][]
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'sqlAccess.status': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['SqlAccessStatus']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'sqlAccess.provision': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['SqlAccessProvisionResult']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'sqlAccess.provisionScript': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'sqlAccess.catalog': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['SqlAccessCatalog']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'sqlAccess.principals.list': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['SqlPrincipal'][]
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'sqlAccess.principals.create': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** @description Request body to create a SQL principal. */
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateSqlPrincipalBody']
      }
    }
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['SqlPrincipalWithPassword']
          }
        }
      }
      /** @description Default Response */
      400: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'sqlAccess.principals.rotate': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['SqlPrincipalWithPassword']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
  'sqlAccess.principals.revoke': {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': {
            data: components['schemas']['SqlPrincipalRevokeResult']
          }
        }
      }
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorBody']
        }
      }
    }
  }
}
