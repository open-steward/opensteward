/**
 * Read-only SQL access — Postgres logins for BI tools onto masked, scoped
 * views of the synced records.
 *
 *   GET  /sql-access                            status, provisioning, principals, catalog
 *   POST /sql-access/provision                  provision now (managed mode)
 *   GET  /sql-access/principals/new             create form
 *   POST /sql-access/principals                 create → the one-time password page
 *   POST /sql-access/principals/:id/rotate      rotate → the one-time password page
 *   POST /sql-access/principals/:id/revoke      revoke
 *
 * Every page needs `sql_access:manage`; the unmasked (PII) option is offered
 * only to `data:read_pii` holders, and the catalog section appears only for
 * `data:read` holders. admin-api enforces all three, and integration-server
 * keeps each principal inside the user's tenant scope.
 *
 * A password is rendered exactly once, on the page answering the create or
 * rotate POST, with `Cache-Control: no-store` — there is no URL to reload it
 * from. It is never put in a flash cookie, a redirect or a log.
 *
 * On SQLite the page explains that SQL access needs the Postgres backend.
 * Served with the strict CSP (`../csp.ts`).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { hasPermission, requirePermission } from '../auth/middleware'
import { useStrictCsp } from '../csp'
import { flashError, flashSuccess } from '../flash'
import type { AdminApiClient } from '../proxy/admin-api-client'
import type {
  SqlAccessStatusRecord,
  SqlCatalogRecord,
  SqlPrincipalRecord,
  SqlPrincipalSecretRecord,
} from '../proxy/data-platform-types'
import {
  describeScope,
  scopeFromForm,
  scopePickerModel,
  type ScopeSelection,
} from '../scope-picker'
import { upstreamRefusal, type UpstreamRefusal } from './destinations'

type Form = Record<string, string | string[] | undefined>

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function one(v: string | string[] | undefined): string {
  const l = Array.isArray(v) ? v : v === undefined ? [] : [v]
  return (l[l.length - 1] ?? '').trim()
}

function status(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status
}

function isRefusal(err: unknown): boolean {
  const s = status(err)
  return s !== undefined && s >= 400 && s < 500
}

/** Connection strings for the one-time password page. */
export function connectionSnippets(opts: {
  host: string | null
  database: string | null
  username: string
  password: string
}) {
  const host = opts.host || '<database-host>'
  const db = opts.database || 'opensteward'
  const user = encodeURIComponent(opts.username)
  const pass = encodeURIComponent(opts.password)
  return {
    host,
    database: db,
    psql: `psql "postgresql://${user}:${pass}@${host}:5432/${encodeURIComponent(db)}?sslmode=require"`,
    jdbc: `jdbc:postgresql://${host}:5432/${db}?sslmode=require&user=${user}&password=${pass}`,
    hostKnown: !!opts.host,
  }
}

export function createSqlAccessRoutes(apiClient: AdminApiClient) {
  return async function sqlAccessRoutes(fastify: FastifyInstance): Promise<void> {
    useStrictCsp(fastify)
    fastify.addHook('preHandler', requirePermission('sql_access:manage'))

    fastify.get('/sql-access', async (request, reply) => {
      const user = request.sessionUser!
      const status = await apiClient.getSqlAccessStatus(user.token)
      const postgres = status?.backend === 'postgres'
      let principals: SqlPrincipalRecord[] = []
      let principalsError: UpstreamRefusal | null = null
      let catalog: SqlCatalogRecord | null = null
      let script: string | null = null
      let scriptError: UpstreamRefusal | null = null
      if (postgres) {
        try {
          principals = await apiClient.listSqlPrincipals(user.token)
        } catch (err) {
          if (!isRefusal(err)) throw err
          principalsError = upstreamRefusal(err)
        }
        if (hasPermission(user, 'data:read')) {
          catalog = await apiClient.getSqlAccessCatalog(user.token).catch(() => null)
        }
        if (status.mode === 'manual') {
          try {
            script = await apiClient.getSqlAccessProvisionScript(user.token)
          } catch (err) {
            if (!isRefusal(err)) throw err
            scriptError = upstreamRefusal(err)
          }
        }
      }
      return reply.view('sql-access/index.ejs', {
        user,
        status,
        postgres,
        principals: principals.map((p) => ({
          ...p,
          scopeText: describeScope(p.scope?.tenants ?? [], p.scope?.verticals),
        })),
        principalsError,
        catalog,
        script,
        scriptError,
        canCreate: postgres && !!status?.provisioned,
        title: 'SQL access',
      })
    })

    fastify.post('/sql-access/provision', async (request, reply) => {
      try {
        const r = await apiClient.provisionSqlAccess(request.sessionUser!.token)
        const extra = r.warnings?.length ? ` Warnings: ${r.warnings.join(' ')}` : ''
        flashSuccess(
          reply,
          (r.changed
            ? `Provisioned catalog version ${r.version}${r.breaking ? ' (breaking change: the previous version is kept alongside)' : ''}.`
            : `Already up to date (version ${r.version}).`) + extra,
        )
      } catch (err) {
        if (!isRefusal(err)) throw err
        const e = upstreamRefusal(err)
        flashError(reply, e.code ? `${e.message} (${e.code})` : e.message)
      }
      return reply.redirect('/sql-access')
    })

    async function renderNew(
      request: FastifyRequest,
      reply: FastifyReply,
      opts: {
        body?: Form
        selected?: ScopeSelection
        error?: UpstreamRefusal | null
        statusCode?: number
      } = {},
    ) {
      const user = request.sessionUser!
      const picker = await scopePickerModel(apiClient, user)
      const body = opts.body ?? {}
      return reply.status(opts.statusCode ?? 200).view('sql-access/principal-new.ejs', {
        user,
        picker,
        selected: opts.selected ?? { tenants: picker.allowAll ? '*' : [], verticals: [] },
        form: {
          label: one(body['label']),
          pii: one(body['pii']) === 'on',
          expires: one(body['expires']),
          connectionLimit: one(body['connection_limit']) || '5',
        },
        canReadPii: hasPermission(user, 'data:read_pii'),
        error: opts.error ?? null,
        title: 'New SQL login',
      })
    }

    /** The one page a password is ever shown on. Never cached. */
    async function renderSecret(
      request: FastifyRequest,
      reply: FastifyReply,
      result: SqlPrincipalSecretRecord,
      kind: 'created' | 'rotated',
    ) {
      const status: SqlAccessStatusRecord | null = await apiClient
        .getSqlAccessStatus(request.sessionUser!.token)
        .catch(() => null)
      reply.header('Cache-Control', 'no-store')
      reply.header('Pragma', 'no-cache')
      return reply.view('sql-access/principal-created.ejs', {
        user: request.sessionUser,
        kind,
        principal: result.principal,
        password: result.password,
        mode: result.mode,
        script: result.script ?? null,
        sessionsTerminated: result.sessionsTerminated ?? null,
        snippets: connectionSnippets({
          host: result.connection?.host ?? status?.readHost ?? null,
          database: status?.database ?? null,
          username: result.principal.username,
          password: result.password,
        }),
        searchPath: result.connection?.searchPath ?? result.principal.searchPath,
        title: kind === 'created' ? 'SQL login created' : 'SQL password rotated',
      })
    }

    fastify.get('/sql-access/principals/new', async (request, reply) => renderNew(request, reply))

    fastify.post<{ Body: Form }>('/sql-access/principals', async (request, reply) => {
      const user = request.sessionUser!
      const body = request.body ?? {}
      const picker = await scopePickerModel(apiClient, user)
      const { selection, error: scopeError } = scopeFromForm(body, picker)
      const label = one(body['label'])
      const fail = (message: string) =>
        renderNew(request, reply, {
          body,
          selected: selection,
          error: { code: null, message, details: [] },
          statusCode: 400,
        })
      if (!label) return fail('Give the login a label.')
      if (scopeError) return fail(scopeError)
      const expires = one(body['expires'])
      if (expires && !DATE_RE.test(expires)) return fail('The expiry must be a date.')
      const limit = Number(one(body['connection_limit']) || '5')
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        return fail('The connection limit must be a whole number from 1 to 100.')
      }
      let result: SqlPrincipalSecretRecord
      try {
        result = await apiClient.createSqlPrincipal(user.token, {
          label,
          pii: hasPermission(user, 'data:read_pii') && one(body['pii']) === 'on',
          scope: {
            tenants: selection.tenants,
            ...(selection.verticals.length > 0 ? { verticals: selection.verticals } : {}),
          },
          // End of the chosen day, UTC.
          expiresAt: expires ? `${expires}T23:59:59Z` : null,
          connectionLimit: limit,
        })
      } catch (err) {
        if (!isRefusal(err)) throw err
        return renderNew(request, reply, {
          body,
          selected: selection,
          error: upstreamRefusal(err),
          statusCode: status(err) === 403 ? 403 : status(err) === 409 ? 409 : 400,
        })
      }
      return renderSecret(request, reply, result, 'created')
    })

    fastify.post<{ Params: { id: string } }>(
      '/sql-access/principals/:id/rotate',
      async (request, reply) => {
        let result: SqlPrincipalSecretRecord
        try {
          result = await apiClient.rotateSqlPrincipal(request.sessionUser!.token, request.params.id)
        } catch (err) {
          if (!isRefusal(err)) throw err
          const e = upstreamRefusal(err)
          flashError(reply, e.code ? `${e.message} (${e.code})` : e.message)
          return reply.redirect('/sql-access')
        }
        return renderSecret(request, reply, result, 'rotated')
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/sql-access/principals/:id/revoke',
      async (request, reply) => {
        try {
          const r = await apiClient.revokeSqlPrincipal(
            request.sessionUser!.token,
            request.params.id,
          )
          if (r.script) {
            // Manual mode: the revoke only takes effect once an operator runs
            // this. Shown once, like a password page (no secret in it).
            reply.header('Cache-Control', 'no-store')
            return reply.view('sql-access/principal-created.ejs', {
              user: request.sessionUser,
              kind: 'revoked',
              principal: r.principal,
              password: null,
              mode: r.mode,
              script: r.script,
              sessionsTerminated: r.sessionsTerminated,
              snippets: null,
              searchPath: r.principal.searchPath,
              title: 'SQL login revoked',
            })
          }
          const ended =
            typeof r.sessionsTerminated === 'number' && r.sessionsTerminated > 0
              ? ` ${r.sessionsTerminated} open session(s) ended.`
              : ''
          flashSuccess(reply, `Login ${r.principal.username} revoked.${ended}`)
        } catch (err) {
          if (!isRefusal(err)) throw err
          const e = upstreamRefusal(err)
          flashError(reply, e.code ? `${e.message} (${e.code})` : e.message)
        }
        return reply.redirect('/sql-access')
      },
    )
  }
}
