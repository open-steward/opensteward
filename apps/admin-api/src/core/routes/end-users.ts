/**
 * Admin passthrough for `/admin/end-users` on integration-server.
 *
 * The end-user table lives in integration-server's encrypted SQLite (so PII
 * sits next to the credentials it relates to). Admin-api re-exposes the
 * admin surface through its existing JWT-protected pipeline so the admin
 * UI keeps a single auth model.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { UnifiedClient } from '../proxy/client'
import type { AdminStore } from '../db/admin-store'
import {
  CreateEndUserBody,
  EndUserDetail,
  EndUserSummary,
  UpdateEndUserBody,
  dataEnvelope,
  listEnvelope,
  errorBody,
  noContent,
} from './_openapi'
import { RepeatableString, one } from './_query'
import { callerContext, denyRestrictedScope } from '../auth/access'

const TAG = 'end-users'

/**
 * EVERY param is `RepeatableString`, never a bare `z.string()`.
 *
 * Fastify's parser yields an ARRAY for a repeated key, and a bare string
 * schema answers 400 for the whole page on one. This operation adopted
 * `RepeatableString` on its NEW params only, so `?page=1&page=2` still 400'd
 * while `?sort=a&sort=b` returned 200 — a surface that is less predictable
 * than either extreme, which is the ruling that settled the same split on the
 * deliveries route.
 *
 * Widening is only half the job: every value MUST pass through `one()` before
 * it is used, or the 400 becomes a 500.
 */
const ListQuery = z.object({
  tenantId: RepeatableString.optional(),
  q: RepeatableString.optional(),
  limit: RepeatableString.optional(),
  offset: RepeatableString.optional(),
  page: RepeatableString.optional(),
  // Sorting and per-column filters for the /customers list page. Forwarded
  // to integration-server's `GET /admin/end-users` (and from there into
  // `EndUserStore.list`/`countEndUsers`) with the SAME key names — see
  // `UnifiedClient.listEndUsersPaged`.
  sort: RepeatableString.optional().meta({
    description:
      'Column to order by: one of `email`, `displayName`, `externalReference`, `tenantId`, `created`. An unrecognised value is ignored and the default order (most recently created first) is used.',
    example: 'email',
  }),
  dir: RepeatableString.optional().meta({
    description: 'Sort direction: `asc` or `desc`. Any other value (including omitted) is ascending.',
    example: 'desc',
  }),
  email: RepeatableString.optional().meta({
    description: 'Case-insensitive substring match against the email address.',
    example: 'jane',
  }),
  displayName: RepeatableString.optional().meta({
    description: 'Case-insensitive substring match against the display name.',
    example: 'Jane',
  }),
  externalReference: RepeatableString.optional().meta({
    description: 'Case-insensitive substring match against the external reference.',
    example: 'crm-100',
  }),
})

const IdParam = z.object({ id: z.string() })

const GetQuery = z.object({
  // `RepeatableString` like every other param on this route's operations: a
  // bare `z.string()` answered 400 for `?include_pii=x&include_pii=x`, and a
  // repeated key on a GET must degrade, not refuse. `one()` collapses it
  // below — a raw array is `!== 'true'`, which reads as "PII not requested",
  // so the array would have been safe here; it is collapsed anyway so this
  // param cannot become the exception a later reader copies.
  include_pii: RepeatableString.optional(),
})

export function createEndUsersRoutes(client: UnifiedClient, adminStore: AdminStore) {
  return async function endUsersRoutes(fastify: FastifyInstance): Promise<void> {
    // Not tenant-scoped yet: a tenant-restricted caller is refused outright
    // (403 SCOPE_RESTRICTED) rather than shown every tenant's rows.
    fastify.addHook('preHandler', denyRestrictedScope)
    fastify.get<{
      Querystring: {
        // `string | string[]` throughout — what Fastify's parser really hands
        // over. Typing a param as a bare string does not make it one; it only
        // hides the array from the compiler.
        tenantId?: string | string[]
        q?: string | string[]
        limit?: string | string[]
        offset?: string | string[]
        page?: string | string[]
        sort?: string | string[]
        dir?: string | string[]
        email?: string | string[]
        displayName?: string | string[]
        externalReference?: string | string[]
      }
    }>(
      '/api/end-users',
      {
        preHandler: [fastify.authenticate],
        schema: {
          tags: [TAG],
          summary: 'List end-users (Connect Link customers)',
          description:
            'List end-users (the customers who authorize integrations through Connect Link), with optional `tenantId`, free-text `q`, and `limit`/`offset` pagination. Any authenticated operator. PII is omitted from the summary view.',
          operationId: 'end-users.list',
          querystring: ListQuery,
          response: {
            200: listEnvelope(EndUserSummary),
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async (request) => {
        const tenantId = one(request.query.tenantId)
        const q = one(request.query.q)
        const limit = one(request.query.limit)
        const offset = one(request.query.offset)
        const sort = one(request.query.sort)?.trim() || undefined
        const dir = one(request.query.dir)?.trim() === 'desc' ? 'desc' : undefined
        const email = one(request.query.email)?.trim() || undefined
        const displayName = one(request.query.displayName)?.trim() || undefined
        const externalReference = one(request.query.externalReference)?.trim() || undefined
        // When `page` is supplied (the customers list page), ask
        // integration-server for exactly that page AND its real total in one
        // round trip (`listEndUsersPaged`), rather than the old shape of
        // fetching `listEndUsers({ tenantId, q })` with NO limit and reading
        // `all.length` as the total. That old call silently collapsed to
        // `EndUserStore.list`'s own 50-row default — there was no way to ask
        // it for "every matching row" — so `meta.total` was capped at 50 no
        // matter how many customers actually existed, and the 51st was
        // unreachable from the admin UI while the page header confidently
        // printed "50 customers". `sort`/`dir`/the three per-column filters
        // are honoured on BOTH branches below (not gated on `page`): they
        // are declared once, at the operation level, for BOTH — a caller
        // reading only the Zod descriptions would have no way to know they
        // silently did nothing without `page`, and integration-server's
        // `GET /admin/end-users` has no `page` concept at all to gate on in
        // the first place (see `UnifiedClient.listEndUsers`). The plain
        // `limit`/`offset` path (used by the search.json autocomplete,
        // which doesn't pass these) is otherwise unaffected below.
        if (request.query.page !== undefined) {
          const page = Math.max(1, parseInt(one(request.query.page) ?? '1', 10) || 1)
          const pageLimit = Math.min(Math.max(1, parseInt(limit ?? '50', 10) || 50), 200)
          const { data, meta } = await client.listEndUsersPaged({
            tenantId,
            q,
            email,
            displayName,
            externalReference,
            sort,
            dir,
            limit: pageLimit,
            offset: (page - 1) * pageLimit,
          })
          return { data, meta: { page, limit: pageLimit, total: meta.total } }
        }
        const limitNum = limit ? Number(limit) : undefined
        const offsetNum = offset ? Number(offset) : undefined
        const data = await client.listEndUsers({
          tenantId,
          q,
          email,
          displayName,
          externalReference,
          sort,
          dir,
          limit: limitNum,
          offset: offsetNum,
        })
        const effLimit = limitNum ?? data.length
        const page = effLimit > 0 ? Math.floor((offsetNum ?? 0) / effLimit) + 1 : 1
        return { data, meta: { page, limit: effLimit, total: data.length } }
      },
    )

    fastify.get<{ Params: { id: string }; Querystring: { include_pii?: string | string[] } }>(
      '/api/end-users/:id',
      {
        preHandler: [fastify.authenticate],
        schema: {
          tags: [TAG],
          summary: 'Read a single end-user',
          description:
            'Read one end-user by id. Any authenticated operator. Pass `include_pii=true` to reveal sensitive personal-ID fields — that privileged path requires the **admin** role (returns `403` otherwise) and writes an `end_user.pii_reveal` audit entry. Returns `404` if the end-user does not exist.',
          operationId: 'end-users.get',
          params: IdParam,
          querystring: GetQuery,
          response: {
            200: dataEnvelope(EndUserDetail),
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const includePii = one(request.query.include_pii) === 'true'
        if (includePii) {
          // Reveal of personal-ID number is admin-only and audited. The detail
          // endpoint itself is operator+; the `include_pii` flag is the
          // privileged path.
          if ((await callerContext(request)).baseRole !== 'admin') {
            return reply.status(403).send({ error: 'Admin role required to reveal PII.' })
          }
          adminStore.writeAudit(request.jwtUser!.id, 'end_user.pii_reveal', undefined, request.params.id)
        }
        const data = await client.getEndUser(request.params.id, { includePii })
        if (!data) return reply.status(404).send({ error: 'End-user not found.' })
        return { data }
      },
    )

    fastify.post(
      '/api/end-users',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly],
        schema: {
          tags: [TAG],
          summary: 'Create a new end-user',
          description:
            'Create a new end-user record. Operator role or higher. Writes an `end_user.create` audit entry.',
          operationId: 'end-users.create',
          body: CreateEndUserBody,
          response: {
            200: dataEnvelope(EndUserSummary),
            400: errorBody,
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async (request) => {
        const data = await client.createEndUser(request.body as Record<string, unknown>)
        adminStore.writeAudit(request.jwtUser!.id, 'end_user.create')
        return { data: data as Record<string, unknown> }
      },
    )

    fastify.patch<{ Params: { id: string } }>(
      '/api/end-users/:id',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly],
        schema: {
          tags: [TAG],
          summary: 'Patch an end-user',
          description:
            'Partially update an end-user; only the supplied fields are changed. Operator role or higher. Writes an `end_user.update` audit entry.',
          operationId: 'end-users.update',
          params: IdParam,
          body: UpdateEndUserBody,
          response: {
            200: dataEnvelope(EndUserSummary),
            400: errorBody,
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async (request) => {
        const data = await client.updateEndUser(request.params.id, request.body as Record<string, unknown>)
        adminStore.writeAudit(request.jwtUser!.id, 'end_user.update', undefined, request.params.id)
        return { data: data as Record<string, unknown> }
      },
    )

    fastify.delete<{ Params: { id: string } }>(
      '/api/end-users/:id',
      {
        preHandler: [fastify.authenticate, fastify.adminOnly],
        schema: {
          tags: [TAG],
          summary: 'Delete an end-user',
          description:
            'Delete an end-user record. Admin role required. Writes an `end_user.delete` audit entry.',
          operationId: 'end-users.delete',
          params: IdParam,
          response: {
            204: noContent,
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async (request, reply) => {
        await client.deleteEndUser(request.params.id)
        adminStore.writeAudit(request.jwtUser!.id, 'end_user.delete', undefined, request.params.id)
        return reply.status(204).send()
      },
    )
  }
}
