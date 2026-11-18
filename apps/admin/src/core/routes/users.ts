import type { FastifyInstance } from 'fastify'
import { requireRole } from '../auth/middleware'
import { flashError, flashSuccess } from '../flash'
import type { AdminApiClient } from '../proxy/admin-api-client'
import { applyTableQuery, parseTableQuery, type TableSpec } from '../views/table-controls'

/**
 * Which columns of the users table sort and filter, and on what.
 *
 * Authored rather than derived: a header is not a field name, and several
 * columns across these tables render composites with no single sortable value.
 */
const USERS_TABLE: TableSpec = {
  id: 'users-filters',
  baseUrl: '/users',
  columns: [
    { key: 'username', header: 'Username', sortable: true, filter: 'text', get: (u: any) => u.username },
    {
      key: 'role',
      header: 'Role',
      sortable: true,
      filter: {
        type: 'enum',
        options: [
          { value: 'admin', label: 'admin' },
          { value: 'operator', label: 'operator' },
          { value: 'viewer', label: 'viewer' },
        ],
      },
      get: (u: any) => u.role,
    },
    { key: 'created', header: 'Created', sortable: true, get: (u: any) => u.createdAt },
    { key: 'actions', header: 'Actions' },
  ],
}

function apiError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: unknown } }; message?: string }
  const raw = e?.response?.data?.error
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object' && 'message' in raw) return String((raw as { message: unknown }).message)
  return e?.message ?? fallback
}

/**
 * Parse the scope editor: `tenants` is the ticked tenant ids (one string or
 * several), `verticals_<tenantId>` an optional comma list — empty means every
 * vertical of that tenant.
 */
export function parseScopeForm(body: Record<string, unknown>): {
  mode: 'all' | 'restricted'
  grants: Array<{ tenantId: string; verticals: '*' | string[] }>
  source: 'manual' | 'idp'
} {
  const mode = body['mode'] === 'restricted' ? 'restricted' : 'all'
  const raw = body['tenants']
  const tenants = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(String).filter(Boolean)
  const grants = tenants.map((tenantId) => {
    const list = String(body[`verticals_${tenantId}`] ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
    return { tenantId, verticals: list.length > 0 ? list : ('*' as const) }
  })
  return { mode, grants: mode === 'restricted' ? grants : [], source: body['source'] === 'idp' ? 'idp' : 'manual' }
}

export function createUsersRoutes(apiClient: AdminApiClient) {
  /** Role and tenant pickers for the detail page. Best-effort: the page is
   *  still worth showing when either read fails; the template falls back to
   *  the built-in roles and hides the tenant list. */
  async function pickers(token: string) {
    const [roles, tenants] = await Promise.all([
      apiClient.listRoles(token).catch(() => []),
      apiClient.listTenants(token).catch(() => []),
    ])
    return { roles, tenants }
  }

  return async function usersRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', requireRole('admin'))

    fastify.get('/users', async (request, reply) => {
      const token = request.sessionUser!.token
      const users = await apiClient.listUsers(token)
      const rows = users.map((u) => ({ ...u, isSelf: u.id === request.sessionUser?.id }))
      const tableState = parseTableQuery(request.query, USERS_TABLE)
      return reply.view('users/index.ejs', {
        user: request.sessionUser,
        users: applyTableQuery(rows, tableState, USERS_TABLE),
        tableSpec: USERS_TABLE,
        tableState,
      })
    })

    fastify.get<{ Params: { id: string }; Querystring: { reveal?: string } }>(
      '/users/:id',
      async (request, reply) => {
        const token = request.sessionUser!.token
        // `reveal` is threaded straight through: the server writes the audit
        // entry, so asking for it here is asking for it there.
        const reveal = request.query.reveal === 'true'
        const account = await apiClient.getUser(token, request.params.id, {
          includeIdentity: reveal,
        })
        // Best-effort: the account page is still worth showing if the audit
        // read fails, and an empty list here is visibly labelled as such.
        const recent = account
          ? await apiClient
              .listAudit(token, 1, 10, { user_id: account.username })
              .then((r) => r.data)
              .catch(() => [])
          : []
        return reply.status(account ? 200 : 404).view('users/detail.ejs', {
          user: request.sessionUser,
          account,
          revealed: reveal,
          recent,
          ...(account ? await pickers(token) : {}),
          csrfToken: (request as any).csrfToken,
        })
      },
    )

    fastify.get('/users/new', async (request, reply) => {
      return reply.view('users/new.ejs', {
        user: request.sessionUser,
        error: null,
        csrfToken: (request as any).csrfToken,
      })
    })

    fastify.post<{ Body: { username: string; password: string; role: string; email?: string } }>(
      '/users',
      async (request, reply) => {
        const token = request.sessionUser!.token
        const { username, password, role } = request.body ?? ({} as Record<string, string>)
        // Optional; admin-api validates it. Kept on a re-render so a typo in
        // one field does not cost the others.
        const email = String(request.body?.email ?? '').trim()
        if (!username || !password || !role) {
          return reply.view('users/new.ejs', {
            user: request.sessionUser,
            error: 'Username, password and role are required',
            values: { username, role, email },
          })
        }

        try {
          await apiClient.createUser(token, username, password, role, email || undefined)
          return reply.redirect('/users')
        } catch (err: any) {
          const error = err?.response?.data?.error ?? 'Failed to create user'
          return reply.view('users/new.ejs', {
            user: request.sessionUser,
            error,
            values: { username, role, email },
          })
        }
      },
    )

    fastify.post<{ Params: { id: string }; Body: { role?: string; roleId?: string } }>(
      '/users/:id/role',
      async (request, reply) => {
        const token = request.sessionUser!.token
        const roleId = (request.body?.roleId ?? '').trim()
        const role = (request.body?.role ?? '').trim()
        try {
          // `roleId` (built-in or custom) from the role picker; `role` is the
          // pre-custom-role form field, still accepted.
          if (roleId) await apiClient.assignUserRole(token, request.params.id, roleId)
          else await apiClient.updateUser(token, request.params.id, { role })
          flashSuccess(reply, 'Role changed.')
        } catch (err) {
          request.log.warn({ err }, 'role change refused')
          flashError(reply, apiError(err, 'Role change refused.'))
        }
        // The detail page re-renders with the new role — or the old one plus
        // the break-glass banner when admin-api refused the demotion.
        return reply.redirect(`/users/${request.params.id}`)
      },
    )

    fastify.post<{ Params: { id: string }; Body: Record<string, unknown> }>(
      '/users/:id/scope',
      async (request, reply) => {
        const token = request.sessionUser!.token
        try {
          await apiClient.setUserScope(token, request.params.id, parseScopeForm(request.body ?? {}))
          flashSuccess(reply, 'Tenant scope saved.')
        } catch (err) {
          flashError(reply, apiError(err, 'Failed to save tenant scope.'))
        }
        return reply.redirect(`/users/${request.params.id}`)
      },
    )

    fastify.post<{ Params: { id: string }; Body: { password?: string; confirm?: string } }>(
      '/users/:id/password',
      async (request, reply) => {
        const token = request.sessionUser!.token
        const password = request.body?.password ?? ''
        const confirm = request.body?.confirm ?? ''
        const account = await apiClient.getUser(token, request.params.id, {})
        const extra = account ? await pickers(token) : {}
        const rerender = (error: string | null, notice: string | null) =>
          reply.status(account ? 200 : 404).view('users/detail.ejs', {
            user: request.sessionUser,
            account,
            revealed: false,
            recent: [],
            ...extra,
            error,
            notice,
            csrfToken: (request as any).csrfToken,
          })
        if (!password || password !== confirm) {
          return rerender('Passwords must match and not be empty.', null)
        }
        try {
          await apiClient.updateUser(token, request.params.id, { password })
          return rerender(null, 'Password reset. Hand it to the user out-of-band.')
        } catch (err: any) {
          const error = err?.response?.data?.error ?? 'Failed to reset password.'
          return rerender(error, null)
        }
      },
    )

    fastify.post<{ Params: { id: string } }>('/users/:id/delete', async (request, reply) => {
      const token = request.sessionUser!.token
      await apiClient.deleteUser(token, request.params.id)
      return reply.redirect('/users')
    })
  }
}
