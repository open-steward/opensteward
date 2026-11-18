/**
 * Admin-guarded routes for the Connect Link feature.
 *
 *   POST   /admin/end-users
 *   GET    /admin/end-users
 *   GET    /admin/end-users/:id
 *   PATCH  /admin/end-users/:id
 *   DELETE /admin/end-users/:id
 *
 *   POST   /admin/connect-sessions
 *   GET    /admin/connect-sessions
 *   GET    /admin/connect-sessions/:id
 *   DELETE /admin/connect-sessions/:id
 *
 * All gated by the same `adminGuard` (X-Admin-Secret) used across the rest
 * of the unified service. admin-api proxies these through its JWT-protected
 * passthrough so the admin UI hits one auth boundary.
 */
import type { FastifyPluginAsync } from 'fastify'
import { ConnectSessionStore } from '../auth/connect-sessions'
import { EndUserStore, DuplicateEmailError } from '../auth/end-users'
import { CredentialStore } from '../auth/store'
import { computeStatus } from '../schemas/connection'
import { CreateConnectSessionBodySchema } from '../schemas/connect-session'
import { CreateEndUserBodySchema, UpdateEndUserBodySchema } from '../schemas/end-user'
import { adminGuard } from './admin-guard'
import { one } from '../util/query-params'
import { resolvePublicBaseUrlOrNull } from './public-base-url'

export interface ConnectAdminRouterOptions {
  store: CredentialStore
  endUsers: EndUserStore
  sessions: ConnectSessionStore
  /** Same precedence chain as auth-router: companyInfo > env > host. */
  getCompanyBaseUrl?: () => Promise<string | null> | string | null
  /** Resolve a tenant's custom domain so the minted Connect Link lives on that
   *  tenant's own domain. Returns null when the tenant has no custom domain. */
  getTenantBaseUrl?: (tenantId: string) => Promise<string | null> | string | null
  /**
   * Live read of the deployment's Connect Link defaults
   * (`connect_link.default_expiry_hours`, `connect_link.one_time_default`).
   * Applied only when the request leaves the field unset — an explicit value
   * always wins. Omit and the store's 7-day fallback applies.
   */
  linkDefaults?: () => { expiryHours: number; oneTimeDefault: boolean }
}

export function createConnectAdminRouter(opts: ConnectAdminRouterOptions): FastifyPluginAsync {
  // Deployment default expiry, read per request so the runtime setting
  // applies live. Returns undefined when no resolver is wired, letting the
  // session store's own 7-day fallback stand.
  const defaultExpiresAt = (): number | undefined => {
    const d = opts.linkDefaults?.()
    return d && d.expiryHours > 0 ? Date.now() + d.expiryHours * 3_600_000 : undefined
  }
  const { store, endUsers, sessions, getCompanyBaseUrl, getTenantBaseUrl } = opts

  /**
   * The address to hand a customer for one Connect Link, or `null` when this
   * deployment has not been told what that address is.
   *
   * A Connect Link is opened by a customer's browser, so it must never carry
   * the compose network's own hostname. These requests arrive from admin-api
   * over that network, so with no PUBLIC_BASE_URL and no companyInfo.baseUrl
   * the request-derived fallback would emit `http://integration-server/connect/…`,
   * which resolves nowhere. `resolvePublicBaseUrlOrNull` withholds instead, and
   * a caller that gets `null` must say what to configure rather than paste
   * something that merely looks like a link.
   *
   * The tenant's own base URL is part of the answer, not a detail: a tenant on
   * a custom domain has its links on that domain. Anything reconstructing a
   * link as `companyBaseUrl + '/connect/' + token` gets that case wrong even
   * when it has a base to work with — which is why this resolution belongs
   * here, next to the token, rather than in each consumer.
   */
  async function resolveSessionUrl(
    request: Parameters<typeof resolvePublicBaseUrlOrNull>[0],
    session: { token: string; tenantId: string },
    tenantBaseCache?: Map<string, string | null>,
  ): Promise<string | null> {
    const baseInputs: { companyBaseUrl?: string | null; tenantBaseUrl?: string | null } = {}
    if (getCompanyBaseUrl) {
      try {
        baseInputs.companyBaseUrl = (await getCompanyBaseUrl()) ?? null
      } catch {
        /* ignore */
      }
    }
    if (getTenantBaseUrl) {
      try {
        // Cached across a list: one lookup per distinct tenant, not per row.
        if (tenantBaseCache?.has(session.tenantId)) {
          baseInputs.tenantBaseUrl = tenantBaseCache.get(session.tenantId) ?? null
        } else {
          const resolved = (await getTenantBaseUrl(session.tenantId)) ?? null
          tenantBaseCache?.set(session.tenantId, resolved)
          baseInputs.tenantBaseUrl = resolved
        }
      } catch {
        /* ignore */
      }
    }
    const base = resolvePublicBaseUrlOrNull(request, baseInputs)
    return base ? `${base}/connect/${session.token}` : null
  }

  return async (fastify) => {
    fastify.addHook('preHandler', async (request, reply) => {
      if (!adminGuard(request, reply)) return reply
      return
    })

    // ── End-users ───────────────────────────────────────────────────────

    fastify.get<{
      Querystring: {
        // `string | string[]`, because that is what Fastify's parser really
        // hands over for a repeated key. Typing these as bare strings did not
        // make them strings — it hid the array from the compiler, and every
        // one of the text filters below then reached `EndUserStore`'s
        // `filter.<name>.toLowerCase()` as an array: an unhandled 500 on this
        // X-Admin-Secret route, verified live for `email`, `displayName`,
        // `externalReference` and `q`, plus `SQLITE_ERROR: row value misused`
        // for `tenantId`. Every read below goes through `one()`, exactly as
        // `admin-sync-router.ts` and `webhook-subs-admin-router.ts` in this
        // same package already do.
        tenantId?: string | string[]
        q?: string | string[]
        limit?: string | string[]
        offset?: string | string[]
        // Additive-optional: existing callers (the admin app's autocomplete,
        // which sends only tenantId/q/limit/offset) are unaffected by these.
        // Bare names throughout, with no `f_`-prefixed wire form here — this
        // is an X-Admin-Secret-gated internal surface, not the admin app's
        // own `?f_<key>=` URL convention, and every hop from here down to
        // `EndUserStore.list`/`countEndUsers` uses these exact same key
        // names, so nothing along the way needs a translation table. Only
        // admin-api's OWN route (routes/end-users.ts) maps the admin app's
        // `f_<key>` params onto these.
        sort?: string | string[]
        dir?: string | string[]
        email?: string | string[]
        displayName?: string | string[]
        externalReference?: string | string[]
      }
    }>('/admin/end-users', async (request) => {
      // `one()` on EVERY param, not only the ones that crash. A repeated
      // `?sort=` collapsed to an array is safely `false` under the store's
      // `END_USER_SORT_KEYS.has(...)` and is therefore silently DISCARDED, and a
      // repeated `?limit=` becomes `Number([...]) === NaN`, which the store
      // clamps back to its own 50-row default — so the caller's page size and
      // ordering are quietly ignored rather than refused. That quiet half is
      // worse than the crash, not better.
      const tenantId = one(request.query.tenantId)
      const q = one(request.query.q)
      const limit = one(request.query.limit)
      const offset = one(request.query.offset)
      const sort = one(request.query.sort)
      const email = one(request.query.email)
      const displayName = one(request.query.displayName)
      const externalReference = one(request.query.externalReference)
      const dir = one(request.query.dir) === 'desc' ? 'desc' : undefined
      // ONE filter object, passed by reference to both calls below: the page
      // and its total must be computed over the same predicate or the
      // pagination lies. Pinned by `connect-admin-end-users.test.ts`, which
      // asserts a filtered count rather than reading it off `data.length`.
      const filter = { tenantId, q, email, displayName, externalReference }
      // `meta.total` from a real COUNT, run alongside the page fetch — not
      // `list()` with no limit, sliced in JS. That was the old shape (see
      // admin-api's routes/end-users.ts, pre-fix) and it silently capped the
      // reported total at `list()`'s own 50-row default, since there was no
      // way to ask the old code for "every matching row" at all.
      const [data, total] = await Promise.all([
        endUsers.list({
          ...filter,
          limit: limit ? Number(limit) : undefined,
          offset: offset ? Number(offset) : undefined,
          sort,
          dir,
        }),
        endUsers.countEndUsers(filter),
      ])
      return { data, meta: { total } }
    })

    fastify.get<{ Params: { id: string }; Querystring: { include_pii?: string } }>(
      '/admin/end-users/:id',
      async (request, reply) => {
        const includePii = request.query.include_pii === 'true'
        const row = await endUsers.getById(request.params.id, { includePii })
        if (!row) return reply.status(404).send({ error: { code: 'END_USER_NOT_FOUND' } })
        // sessions + connections joined for the admin detail view
        const linkedSessions = await sessions.list({ endUserId: request.params.id })
        const linkedConnections = (
          await Promise.all(
            linkedSessions
              .filter((s) => s.connectionId)
              .map(async (s) => store.getRow(s.connectionId!)),
          )
        )
          .filter((c): c is NonNullable<typeof c> => c !== null)
          // Same health value the connections list shows. Without it the
          // customer page could list a connection but not say whether it works,
          // which is the one thing an operator looking at a customer wants.
          .map((c) => ({
            ...c,
            status: computeStatus({
              expiresAt: c.expiresAt,
              lastRefreshStatus: c.lastRefreshStatus,
            }),
          }))
        return { data: { ...row, sessions: linkedSessions, connections: linkedConnections } }
      },
    )

    fastify.post('/admin/end-users', async (request, reply) => {
      const parsed = CreateEndUserBodySchema.safeParse(request.body ?? {})
      if (!parsed.success)
        return reply
          .status(400)
          .send({ error: { code: 'VALIDATION', issues: parsed.error.issues } })
      try {
        const row = await endUsers.create({
          tenantId: parsed.data.tenantId,
          email: parsed.data.email,
          displayName: parsed.data.displayName ?? null,
          externalReference: parsed.data.externalReference ?? null,
          pii: parsed.data.pii ?? null,
        })
        return reply.status(201).send({ data: row })
      } catch (err) {
        if (err instanceof DuplicateEmailError) {
          // Resolve-or-create idempotency: return the existing row instead of erroring.
          const existing = await endUsers.findByEmail(parsed.data.tenantId, parsed.data.email)
          if (existing) return { data: existing }
        }
        throw err
      }
    })

    fastify.patch<{ Params: { id: string } }>('/admin/end-users/:id', async (request, reply) => {
      const parsed = UpdateEndUserBodySchema.safeParse(request.body ?? {})
      if (!parsed.success)
        return reply
          .status(400)
          .send({ error: { code: 'VALIDATION', issues: parsed.error.issues } })
      const row = await endUsers.update(request.params.id, {
        displayName: parsed.data.displayName,
        externalReference: parsed.data.externalReference,
        pii: parsed.data.pii,
      })
      if (!row) return reply.status(404).send({ error: { code: 'END_USER_NOT_FOUND' } })
      return { data: row }
    })

    fastify.delete<{ Params: { id: string }; Querystring: { cascade?: string } }>(
      '/admin/end-users/:id',
      async (request, reply) => {
        // Opt-in erasure cascade — see the dev route in customers-router.
        // Admin authority, so deleteById (unscoped) is the right primitive.
        if (request.query.cascade === 'connections') {
          const linked = await sessions.list({ endUserId: request.params.id })
          const connectionIds = [
            ...new Set(linked.map((row) => row.connectionId).filter((v): v is string => !!v)),
          ]
          for (const connectionId of connectionIds) {
            await store.deleteById(connectionId)
          }
        }
        // Detach end_user_id from any connect_sessions before delete so we keep
        // session audit trails intact (sessions retain their connection_id).
        await sessions.detachEndUser(request.params.id)
        const ok = await endUsers.deleteById(request.params.id)
        if (!ok) return reply.status(404).send({ error: { code: 'END_USER_NOT_FOUND' } })
        return reply.status(204).send()
      },
    )

    // ── Connect sessions ────────────────────────────────────────────────

    fastify.get<{
      Querystring: {
        tenantId?: string
        endUserId?: string
        status?: string
        limit?: string
        offset?: string
      }
    }>('/admin/connect-sessions', async (request) => {
      const { tenantId, endUserId, status, limit, offset } = request.query
      const list = await sessions.list({
        tenantId,
        endUserId,
        status:
          status === 'active' || status === 'consumed' || status === 'expired' ? status : undefined,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      })
      // `url` per row, resolved the same way the POST resolves the one it
      // returns. Without it the only address a list consumer had was the raw
      // token, and the admin UI's Copy button rebuilt the link itself as
      // `companyBaseUrl + '/connect/' + token` — which produced the bare path
      // `/connect/<token>` whenever no company base URL was set, and the wrong
      // domain for any tenant on a custom one.
      const tenantBaseCache = new Map<string, string | null>()
      const data = await Promise.all(
        list.map(async (row) => ({
          ...row,
          url: (await resolveSessionUrl(request, row, tenantBaseCache)) ?? undefined,
        })),
      )
      return { data }
    })

    fastify.get<{ Params: { id: string } }>(
      '/admin/connect-sessions/:id',
      async (request, reply) => {
        const row = await sessions.getById(request.params.id)
        if (!row) return reply.status(404).send({ error: { code: 'SESSION_NOT_FOUND' } })
        const customer = row.endUserId ? await endUsers.getById(row.endUserId) : null
        const connection = row.connectionId ? await store.getRow(row.connectionId) : null
        const url = (await resolveSessionUrl(request, row)) ?? undefined
        return { data: { ...row, url, customer, connection } }
      },
    )

    fastify.post<{ Body: Record<string, unknown> & { createdBy?: string | null } }>(
      '/admin/connect-sessions',
      async (request, reply) => {
        const parsed = CreateConnectSessionBodySchema.safeParse(request.body ?? {})
        if (!parsed.success)
          return reply
            .status(400)
            .send({ error: { code: 'VALIDATION', issues: parsed.error.issues } })
        const body = parsed.data

        // A one-time link deletes its connection after the first successful
        // sync, so the connection is `once` — anything else could never be
        // honoured. Refused rather than overridden, so the caller learns it.
        // Checked before the customer is resolved below, so a refused mint
        // never creates an end-user from `customerEmail` on the way out.
        const oneTimeOnly = body.oneTimeOnly ?? opts.linkDefaults?.().oneTimeDefault ?? false
        if (oneTimeOnly && body.syncSchedule && body.syncSchedule.mode !== 'once') {
          // When the caller never said one-time, the deployment default did:
          // tell them the one field that unblocks them.
          const viaDefault =
            body.oneTimeOnly === undefined
              ? ' This deployment makes new links one-time by default; send oneTimeOnly: false to choose a sync schedule.'
              : ''
          return reply.status(400).send({
            error: {
              code: 'SYNC_SCHEDULE_CONFLICT',
              message:
                'A one-time link deletes its connection after the first sync, so its sync schedule can only be once.' +
                viaDefault,
            },
          })
        }

        // A link's tenant becomes the resulting connection's `ownerTenantId`
        // (auth-router.ts), which decides which tenant's keys can read that
        // connection and whose webhooks hear about it. So a link naming a
        // customer from another tenant would misattribute a real connection —
        // exactly what tenants exist to prevent.
        //
        // The dev API path enforces the same rule (`customers-router.ts`: a
        // customer outside the caller's tenant reads as CUSTOMER_NOT_FOUND);
        // this admin path must too, since the UI offers a tenant picker.
        if (body.endUserId) {
          const customer = await endUsers.getById(body.endUserId)
          if (!customer || customer.tenantId !== body.tenantId) {
            return reply.status(404).send({
              error: {
                code: 'CUSTOMER_NOT_FOUND',
                message: `No customer with id ${body.endUserId} in tenant ${body.tenantId}.`,
              },
            })
          }
        }

        // Resolve / create the end-user when an email is provided without an explicit id.
        // No tenant check needed here: the upsert creates them in the link's own
        // tenant, so they agree by construction.
        let endUserId: string | null = body.endUserId ?? null
        if (!endUserId && body.customerEmail) {
          // Resolve, then create — never upsert. `upsertByEmail` patches an
          // existing row whenever `displayName !== undefined`, so it would
          // silently rename an existing customer when the form's Display name
          // box is filled in — or, via `?? null`, wipe their name when it is
          // empty — while doing something that has nothing to do with editing
          // a customer.
          //
          // The email path is reached whenever the form has no `endUserId`,
          // which is routine: a pasted address, one typed out and submitted, or
          // a customer outside the ten results the datalist offers.
          //
          // Renaming is what PATCH /admin/end-users/:id is for. Here the display
          // name only ever describes someone being created for the first time.
          const existing = await endUsers.findByEmail(body.tenantId, body.customerEmail)
          endUserId = existing
            ? existing.id
            : (
                await endUsers.create({
                  tenantId: body.tenantId,
                  email: body.customerEmail,
                  displayName: body.customerDisplayName ?? null,
                })
              ).id
        }

        const session = await sessions.create({
          tenantId: body.tenantId,
          label: body.label,
          endUserId,
          allowedVerticals: body.allowedVerticals,
          allowedPlatforms: body.allowedPlatforms,
          redirectUrl: body.redirectUrl ?? null,
          expiresAt: body.expiresAt ?? defaultExpiresAt(),
          createdBy: (request.body as { createdBy?: string | null })?.createdBy ?? null,
          oneTimeOnly,
          scopes: body.scopes,
          scopePolicy: body.scopePolicy,
          allowSelfRegister: body.allowSelfRegister,
          syncSchedule: oneTimeOnly ? { mode: 'once' } : (body.syncSchedule ?? null),
        })

        // Resolve the link URL the admin should send to the customer — the
        // same resolution the list and single GET now use, so a link reads
        // identically wherever it is shown. `null` means this deployment has
        // no public address configured; the session itself is live regardless,
        // and the caller explains what to configure.
        const url = await resolveSessionUrl(request, {
          token: session.token,
          tenantId: body.tenantId,
        })

        return reply
          .status(201)
          .send({ data: { ...session, url, ...(url ? {} : { urlUnresolved: true }) } })
      },
    )

    fastify.delete<{ Params: { id: string } }>(
      '/admin/connect-sessions/:id',
      async (request, reply) => {
        const ok = await sessions.revoke(request.params.id)
        if (!ok) return reply.status(404).send({ error: { code: 'SESSION_NOT_FOUND_OR_FINAL' } })
        return reply.status(204).send()
      },
    )

    // ── Per-connection webhook signing secret ───────────────────────────
    //
    // Set the signing secret a platform uses for THIS connection's webhooks,
    // for when the secret is created manually in the platform's dashboard.
    // Auto-registration stores it automatically (see registerWebhook).
    fastify.put<{ Params: { id: string }; Body: { secret?: string } }>(
      '/admin/connections/:id/webhook-secret',
      async (request, reply) => {
        const secret = (request.body?.secret ?? '').trim()
        if (!secret) return reply.status(400).send({ error: { code: 'SECRET_REQUIRED' } })
        const row = await store.getRow(request.params.id)
        if (!row) return reply.status(404).send({ error: { code: 'CONNECTION_NOT_FOUND' } })
        await store.setWebhookSecret(request.params.id, secret)
        return reply.status(204).send()
      },
    )
  }
}
