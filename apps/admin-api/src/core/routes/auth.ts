import type { FastifyInstance } from 'fastify'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { verifyPassword, createUser } from '../auth/users'
import { LoginLockout } from '../auth/lockout'
import type { AdminStore } from '../db/admin-store'
import type { RuntimeSettingsStore } from '../db/runtime-settings-store'
import { AuthTokenResponse, MeResponse, errorBody } from './_openapi'
import { getAccess, toScopeView } from '../auth/access'
import { PERMISSIONS, permissionsForBuiltin } from '@opensteward/shared'
import { UserAvatarStore } from '../db/user-avatar-store'
import { profileFields } from '../users/profile-view'

const LOCAL_LOGIN_ENABLED = 'auth.local_login_enabled'
const BREAK_GLASS_USER_ID = 'auth.break_glass_user_id'

const TAG = 'auth'

const LoginBody = z
  .object({
    username: z
      .string()
      .min(1)
      .meta({ description: 'Login name of the admin user.', example: 'olivia.admin' }),
    password: z
      .string()
      .min(1)
      .meta({ description: "The user's password.", example: 's3cr3t-password' }),
  })
  .meta({ id: 'LoginBody', description: 'Credentials for local username/password login.' })

const SetupBody = z
  .object({
    username: z.string().min(1).meta({
      description: 'Login name for the first admin user to create during initial setup.',
      example: 'olivia.admin',
    }),
    password: z
      .string()
      .min(1)
      .meta({ description: 'Password for the first admin user.', example: 's3cr3t-password' }),
  })
  .meta({
    id: 'SetupBody',
    description: 'Credentials to bootstrap the first admin account on a fresh deployment.',
  })

const HasUsersResponse = z
  .object({
    hasUsers: z
      .boolean()
      .meta({ description: 'True once at least one admin user exists.', example: false }),
  })
  .meta({
    id: 'HasUsersResponse',
    description: 'Whether the admin user table has been initialised.',
  })

export interface AuthRoutesOptions {
  /** Override the shared lockout tracker (mostly for tests). */
  lockout?: LoginLockout
  /** When set, `POST /api/auth/setup` requires a matching `X-Bootstrap-Token`. */
  bootstrapToken?: string
}

/** Constant-time string compare, length-guarded (timingSafeEqual throws on
 *  unequal-length buffers). */
function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Whether the request came from the local host. admin-api does not enable
 * `trustProxy`, so `request.ip` is the real socket peer — a header cannot
 * forge loopback. Covers IPv4, IPv6 and the IPv4-mapped-IPv6 loopback form.
 */
function isLoopbackRequest(request: { ip?: string }): boolean {
  const ip = request.ip ?? ''
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.startsWith('127.')
}

export function createAuthRoutes(
  store: AdminStore,
  runtimeSettings: RuntimeSettingsStore,
  opts: AuthRoutesOptions = {},
) {
  const avatarStore = UserAvatarStore.for(store)
  const lockout =
    opts.lockout ??
    new LoginLockout({
      onLockout: (event) => {
        void store.writeAudit('system', `user.lockout.${event.kind}`, undefined, event.username, {
          failures: event.failures,
        })
      },
    })

  return async function authRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.post<{ Body: { username: string; password: string } }>(
      '/api/auth/login',
      {
        schema: {
          tags: [TAG],
          summary: 'Sign in with username + password',
          description:
            'Exchange a username and password for a JWT used to authenticate subsequent admin-api calls. No prior authentication required. Subject to lockout after repeated failures (returns `429`, with a `Retry-After` header for temporary locks). Returns `400` if either field is missing, `401` on invalid credentials, and `403` when local login is disabled and the account is not the pinned break-glass admin (SSO-only). Writes a `user.login` audit entry on success.',
          operationId: 'auth.login',
          body: LoginBody,
          response: {
            200: AuthTokenResponse,
            400: errorBody,
            401: errorBody,
            403: errorBody,
            429: errorBody,
          },
          security: [],
        },
      },
      async (request, reply) => {
        const { username, password } = request.body ?? ({} as Record<string, string>)
        if (!username || !password) {
          return reply.status(400).send({ error: 'Username and password are required' })
        }

        const locked = lockout.check(username)
        if (locked) {
          const retrySec = locked.kind === 'permanent' ? -1 : Math.ceil(locked.retryAfterMs / 1000)
          if (retrySec > 0) reply.header('retry-after', String(retrySec))
          return reply.status(429).send({
            error:
              locked.kind === 'permanent'
                ? 'Account locked — contact an administrator to unlock.'
                : `Too many failed attempts — retry in ${retrySec}s.`,
          })
        }

        const user = await verifyPassword(store, username, password)
        if (!user) {
          lockout.recordFailure(username)
          return reply.status(401).send({ error: 'Invalid credentials' })
        }

        // Local-login gate: when disabled, only the pinned break-glass admin
        // may sign in with a password. Everyone else must use SSO.
        const localEnabled = (await runtimeSettings.get(LOCAL_LOGIN_ENABLED))?.value !== false
        if (!localEnabled) {
          const breakGlassId = (await runtimeSettings.get(BREAK_GLASS_USER_ID))?.value
          if (user.id !== breakGlassId) {
            lockout.recordSuccess(username)
            return reply.status(403).send({
              error:
                'Local password login is disabled. Please sign in with your organization (SSO).',
            })
          }
        }

        lockout.recordSuccess(username)
        const token = fastify.jwt.sign({ id: user.id, username: user.username, role: user.role })
        await store.writeAudit(user.id, 'user.login')
        return reply.send({
          token,
          user: { id: user.id, username: user.username, role: user.role },
        })
      },
    )

    // First-run: read-only "are there any users yet?" check used by the setup wizard.
    // Side-effect-free by design — a probe with side effects (e.g. POSTing to /setup)
    // could persist a known-credentials admin.
    fastify.get(
      '/api/auth/has-users',
      {
        schema: {
          tags: [TAG],
          summary: 'Whether any admin user exists yet (first-run check)',
          description:
            'Read-only check the setup wizard uses to decide whether to show the first-run form. No authentication required and no side effects. Returns `{ hasUsers: false }` on a fresh deployment, `{ hasUsers: true }` once the first admin has been created.',
          operationId: 'auth.hasUsers',
          response: {
            200: HasUsersResponse,
          },
          security: [],
        },
      },
      async () => {
        return { hasUsers: await store.hasUsers() }
      },
    )

    // First-run: create initial admin account (no auth required, only works when no users exist)
    fastify.post<{ Body: { username: string; password: string } }>(
      '/api/auth/setup',
      {
        schema: {
          tags: [TAG],
          summary: 'First-run admin bootstrap (only succeeds when no users exist)',
          description:
            'Bootstrap the first `admin` account on a fresh deployment and return a JWT for it. Only succeeds while the user table is empty — returns `409` once any user exists. When the server is started with a `BOOTSTRAP_TOKEN`, the matching token must be supplied in the `X-Bootstrap-Token` header (else `401`), so a fresh or wiped deployment cannot be claimed by an attacker. When NO token is configured, setup is refused from non-loopback addresses (`403`) — a remote first-run must carry a `BOOTSTRAP_TOKEN`; only a caller on the deployment host may set up tokenless. The created admin is auto-pinned as the break-glass account so SSO can be locked down later without losing password access. Returns `400` if username or password is missing.',
          operationId: 'auth.setup',
          body: SetupBody,
          response: {
            201: AuthTokenResponse,
            400: errorBody,
            401: errorBody,
            403: errorBody,
            409: errorBody,
          },
          security: [],
        },
      },
      async (request, reply) => {
        if (await store.hasUsers()) {
          return reply.status(409).send({ error: 'Setup already completed — users exist' })
        }
        // First-run gate: if a bootstrap token is configured, require it. Blocks an
        // attacker from claiming the admin account on a fresh/wiped deployment.
        if (opts.bootstrapToken) {
          const provided = request.headers['x-bootstrap-token']
          if (typeof provided !== 'string' || !tokenMatches(provided, opts.bootstrapToken)) {
            return reply.status(401).send({ error: 'Invalid or missing bootstrap token' })
          }
        } else if (!isLoopbackRequest(request)) {
          // No token configured: the only remaining guard is the empty-table
          // check above, so a network caller could race the operator to claim
          // the admin account on a fresh (or wiped-empty) deployment. Refuse
          // off-box callers entirely — first-run from a remote host must carry
          // a BOOTSTRAP_TOKEN. Loopback (the operator on the box, or a proxy
          // that did not forward X-Forwarded-For) is still allowed for local
          // setup. `trustProxy` is off on admin-api, so `request.ip` is the
          // real socket peer and cannot be spoofed by a header.
          return reply.status(403).send({
            error:
              'First-run setup from a non-loopback address requires a BOOTSTRAP_TOKEN. ' +
              'Set BOOTSTRAP_TOKEN (scripts/generate-secrets.sh mints one) and send it in ' +
              'the X-Bootstrap-Token header, or run setup from the deployment host.',
          })
        }
        const { username, password } = request.body ?? ({} as Record<string, string>)
        if (!username || !password) {
          return reply.status(400).send({ error: 'Username and password are required' })
        }
        // `__`-prefixed names are reserved for internal probes/sentinels.
        if (username.startsWith('__')) {
          return reply.status(400).send({ error: 'Username is reserved' })
        }
        const user = await createUser(store, username, password, 'admin')
        // Auto-pin the first-run admin as the break-glass account so SSO can be
        // locked down later without losing password access.
        if (!(await runtimeSettings.get(BREAK_GLASS_USER_ID))?.value) {
          await runtimeSettings.set(BREAK_GLASS_USER_ID, user.id, user.id)
        }
        const token = fastify.jwt.sign({ id: user.id, username: user.username, role: user.role })
        return reply
          .status(201)
          .send({ token, user: { id: user.id, username: user.username, role: user.role } })
      },
    )

    fastify.get(
      '/api/auth/me',
      {
        preHandler: [fastify.authenticate],
        schema: {
          tags: [TAG],
          summary: 'Return the calling user, with permissions and tenant scope',
          description:
            "Return the decoded JWT claims (id, username, role) for the currently authenticated operator, plus the caller's effective role (`roleId`, `roleName`), `permissions` and tenant `scope`. The last three are read from the database on each call (cached for a few seconds), so they reflect a role or scope change made since the token was issued. Any authenticated operator may call this; useful for confirming a token is valid and discovering what the caller may do. Returns `401` if the token is missing or invalid.",
          operationId: 'auth.me',
          response: {
            200: MeResponse,
            401: errorBody,
          },
        },
      },
      async (request) => {
        const claim = request.jwtUser!
        const access = await getAccess(request)
        // Email and avatar version come from the database, not the token, so
        // a change shows on the caller's next page without a new sign-in.
        const row = await store.getUserById(claim.id)
        const profile = profileFields(
          { id: claim.id, email: row?.email },
          row ? (await avatarStore.head(claim.id))?.sha256 : null,
        )
        if (!access) {
          // No resolver wired (bare harness): the JWT role's built-in set.
          const held = permissionsForBuiltin(claim.role)
          return {
            user: {
              ...claim,
              ...profile,
              roleId: claim.role,
              roleName: claim.role,
              permissions: PERMISSIONS.filter((p) => held.has(p)),
              scope: { mode: 'all' as const, grants: [] },
            },
          }
        }
        const scope = toScopeView(access)
        return {
          user: {
            ...claim,
            ...profile,
            role: access.baseRole,
            roleId: access.roleId,
            roleName: access.roleName,
            permissions: PERMISSIONS.filter((p) => access.permissions.has(p)),
            scope: scope.mode === 'all' ? { mode: 'all' as const, grants: [] } : scope,
          },
        }
      },
    )
  }
}
