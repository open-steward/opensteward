/**
 * Developer-facing customer routes.
 *
 *   GET    /v1/customers
 *   POST   /v1/customers
 *   GET    /v1/customers/:id
 *   PATCH  /v1/customers/:id
 *   DELETE /v1/customers/:id
 *   GET    /v1/customers/:id/connections
 *   POST   /v1/customers/:id/connect-links
 *
 * Tenant scope is taken from `request.tenantId`, populated by
 * `requireTenantKey` middleware on the route. Requests with a body field
 * named `tenantId` are rejected — devs cannot impersonate other tenants.
 *
 * All response shapes match the existing admin routes (`{ data: ... }`)
 * so the same TypeScript types can be shared with admin-api clients.
 */
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { ApiKeyStore } from '../auth/api-keys'
import { ConnectSessionStore } from '../auth/connect-sessions'
import { EndUserStore, DuplicateEmailError } from '../auth/end-users'
import { CredentialStore } from '../auth/store'
import type { WebhookDeliveryStore } from '../auth/webhook-deliveries'
import type { WebhookSubscriptionStore } from '../auth/webhook-subscriptions'
import { ConnectAllowedPlatformSchema } from '../schemas/connect-session'
import { EndUserPiiSchema } from '../schemas/end-user'
import { assertScope, requireTenantKey, type RateLimitConfigSource } from './api-key-middleware'
import type { DeveloperCredentialOptions } from './credential-resolver'
import type { McpEnabledSource } from './api-key-middleware'
import { emitTenantEvent } from './event-emitter'
import { resolvePublicBaseUrlOrNull } from './public-base-url'

export interface CustomersRouterOptions {
  apiKeys: ApiKeyStore
  endUsers: EndUserStore
  sessions: ConnectSessionStore
  credentials: CredentialStore
  /** When provided, customer/connect-link events fire to matching subscriptions. */
  webhookSubs?: WebhookSubscriptionStore
  /** Optional. When supplied, every emitted event is durably queued so failures retry. */
  webhookDeliveries?: WebhookDeliveryStore
  /** Same precedence chain as the auth router. */
  getCompanyBaseUrl?: () => Promise<string | null> | string | null
  /** Static config or per-request resolver (for live admin-tunable budgets). */
  rateLimit?: RateLimitConfigSource
  /**
   * Live read of the deployment's Connect Link defaults
   * (`connect_link.default_expiry_hours`, `connect_link.one_time_default`).
   * Applied only when the request leaves the field unset — an explicit value
   * always wins. Omit and the store's 7-day fallback applies.
   */
  linkDefaults?: () => { expiryHours: number; oneTimeDefault: boolean }
  /** Live read of `features.mcp_enabled`; omit to always allow. */
  mcpEnabled?: McpEnabledSource
  /**
   * Accept OIDC bearer tokens beside `osk_` keys, and the live reads of the
   * two operator toggles. All optional — omit them and only API keys are
   * accepted.
   */
  oauth?: DeveloperCredentialOptions['oauth']
  apiKeysEnabled?: DeveloperCredentialOptions['apiKeysEnabled']
  oauthEnabled?: DeveloperCredentialOptions['oauthEnabled']
}

const CreateCustomerBody = z
  .object({
    email: z.string().email().toLowerCase(),
    displayName: z.string().max(200).optional(),
    externalReference: z.string().max(200).optional(),
    // Nullable as well as optional: PII is genuinely optional here, and callers
    // that build it from a form send `null` for "the operator filled none of it
    // in". Matches the Update schemas and `endUsers.create`, which takes
    // `pii?: EndUserPii | null` (and encryptPii(null) returns null).
    pii: EndUserPiiSchema.nullable().optional(),
  })
  .strict()

const UpdateCustomerBody = z
  .object({
    displayName: z.string().max(200).nullable().optional(),
    externalReference: z.string().max(200).nullable().optional(),
    pii: EndUserPiiSchema.nullable().optional(),
  })
  .strict()

const CreateConnectLinkBody = z
  .object({
    label: z.string().min(1).max(200).optional(),
    vertical: z.string().min(1).optional(),
    platform: z.string().min(1).optional(),
    redirectUrl: z.string().url().optional(),
    /** TTL in seconds. Defaults to the `connect_link.default_expiry_hours` runtime setting (72h out of the box); capped to 90 days. */
    expiresInSeconds: z
      .number()
      .int()
      .positive()
      .max(90 * 24 * 60 * 60)
      .optional(),
    allowedVerticals: z.array(z.string().min(1)).optional(),
    allowedPlatforms: z.array(ConnectAllowedPlatformSchema).optional(),
    /** When true, the connection produced by this link is auto-deleted
     *  after the post-OAuth sync completes. Useful for one-time data pulls
     *  (e.g. KYB / financial onboarding snapshots). */
    oneTimeOnly: z.boolean().optional(),
    /** Per-link OAuth scope override, used when `scopePolicy` is 'custom'
     *  (implied when this is set). Adapters that don't support per-call
     *  overrides silently fall back to platform default. */
    scopes: z.array(z.string().min(1)).optional(),
    /** How scopes are decided for this link, resolved per-platform at
     *  OAuth-start:
     *    - 'read_only' (DEFAULT) — request the platform's curated read-only
     *      scopes; falls back to platform default where none are catalogued.
     *    - 'platform_default' — no override; the platform/dev-app defaults.
     *    - 'custom' — use the explicit `scopes` array.
     *  Omitted defaults to 'read_only'; pass 'platform_default' to use the
     *  platform/dev-app defaults. */
    scopePolicy: z.enum(['read_only', 'platform_default', 'custom']).optional(),
  })
  .strict()

function tenantOf(request: FastifyRequest): string {
  const tenantId = (request as unknown as { tenantId?: string }).tenantId
  if (!tenantId) throw new Error('tenantId middleware did not run')
  return tenantId
}

function notFound(reply: import('fastify').FastifyReply, code: string, message: string) {
  return reply.status(404).send({ error: { code, message } })
}

export function createCustomersRouter(opts: CustomersRouterOptions): FastifyPluginAsync {
  const {
    apiKeys,
    endUsers,
    sessions,
    credentials,
    webhookSubs,
    webhookDeliveries,
    getCompanyBaseUrl,
  } = opts

  const fire = async (
    tenantId: string,
    type: Parameters<typeof emitTenantEvent>[2],
    data: unknown,
  ) => {
    if (!webhookSubs) return
    try {
      await emitTenantEvent(webhookSubs, tenantId, type, data, { deliveries: webhookDeliveries })
    } catch {
      /* never let webhook delivery break the request */
    }
  }

  return async (fastify) => {
    fastify.addHook(
      'preHandler',
      requireTenantKey({
        apiKeys,
        oauth: opts.oauth,
        apiKeysEnabled: opts.apiKeysEnabled,
        oauthEnabled: opts.oauthEnabled,
        rateLimit: opts.rateLimit,
        mcpEnabled: opts.mcpEnabled,
      }),
    )

    // ── List / search ──────────────────────────────────────────────────────
    fastify.get<{ Querystring: { q?: string; limit?: string; offset?: string } }>(
      '/v1/customers',
      async (request, reply) => {
        if (!(await assertScope(request, reply, 'customers:read'))) return
        const tenantId = tenantOf(request)
        const { q, limit, offset } = request.query
        const data = await endUsers.list({
          tenantId,
          q,
          limit: limit ? Number(limit) : undefined,
          offset: offset ? Number(offset) : undefined,
        })
        return { data }
      },
    )

    // ── Create / upsert ────────────────────────────────────────────────────
    fastify.post('/v1/customers', async (request, reply) => {
      if (!(await assertScope(request, reply, 'customers:write'))) return
      const tenantId = tenantOf(request)
      const parsed = CreateCustomerBody.safeParse(request.body ?? {})
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: { code: 'VALIDATION', issues: parsed.error.issues } })
      }
      try {
        const row = await endUsers.create({
          tenantId,
          email: parsed.data.email,
          displayName: parsed.data.displayName ?? null,
          externalReference: parsed.data.externalReference ?? null,
          pii: parsed.data.pii ?? null,
        })
        await fire(tenantId, 'customer.created', row)
        return reply.status(201).send({ data: row })
      } catch (err) {
        if (err instanceof DuplicateEmailError) {
          // Idempotent on (tenantId, email): return the existing row instead of erroring.
          const existing = await endUsers.findByEmail(tenantId, parsed.data.email)
          if (existing) return { data: existing }
        }
        throw err
      }
    })

    // ── Read ────────────────────────────────────────────────────────────────
    fastify.get<{ Params: { id: string }; Querystring: { include_pii?: string } }>(
      '/v1/customers/:id',
      async (request, reply) => {
        if (!(await assertScope(request, reply, 'customers:read'))) return
        const includePii = request.query.include_pii === 'true'
        if (includePii && !(await assertScope(request, reply, 'customers:read_pii'))) return

        const tenantId = tenantOf(request)
        const row = await endUsers.getById(request.params.id, { includePii })
        if (!row || row.tenantId !== tenantId) {
          return notFound(reply, 'CUSTOMER_NOT_FOUND', `No customer with id ${request.params.id}.`)
        }
        if (includePii) {
          const apiKeyId = (request as unknown as { apiKeyId?: string }).apiKeyId
          request.log.info(
            { event: 'pii_reveal', endUserId: row.id, tenantId, apiKeyId },
            'PII revealed via developer API',
          )
          return { data: row }
        }
        const { pii: _pii, ...rest } = row
        return { data: rest }
      },
    )

    // ── Update ──────────────────────────────────────────────────────────────
    fastify.patch<{ Params: { id: string } }>('/v1/customers/:id', async (request, reply) => {
      if (!(await assertScope(request, reply, 'customers:write'))) return
      const tenantId = tenantOf(request)
      const parsed = UpdateCustomerBody.safeParse(request.body ?? {})
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: { code: 'VALIDATION', issues: parsed.error.issues } })
      }
      const existing = await endUsers.getById(request.params.id)
      if (!existing || existing.tenantId !== tenantId) {
        return notFound(reply, 'CUSTOMER_NOT_FOUND', `No customer with id ${request.params.id}.`)
      }
      const row = await endUsers.update(request.params.id, {
        displayName: parsed.data.displayName,
        externalReference: parsed.data.externalReference,
        pii: parsed.data.pii,
      })
      if (row) await fire(tenantId, 'customer.updated', row)
      return { data: row }
    })

    // ── Delete ──────────────────────────────────────────────────────────────
    fastify.delete<{ Params: { id: string }; Querystring: { cascade?: string } }>(
      '/v1/customers/:id',
      async (request, reply) => {
        if (!(await assertScope(request, reply, 'customers:write'))) return
        const tenantId = tenantOf(request)
        const existing = await endUsers.getById(request.params.id)
        if (!existing || existing.tenantId !== tenantId) {
          return notFound(reply, 'CUSTOMER_NOT_FOUND', `No customer with id ${request.params.id}.`)
        }
        // Opt-in erasure cascade: `?cascade=connections` also deletes every
        // connection this customer's links produced — which fires the standard
        // delete cascade (cached resources, sync jobs, external-account
        // links, audit forwarding). Without it, deleting the customer leaves
        // their OAuth grant and synced data fully intact, which is the wrong
        // default for a right-to-erasure request.
        let deletedConnections = 0
        if (request.query.cascade === 'connections') {
          const linked = await sessions.list({ endUserId: request.params.id })
          const connectionIds = [
            ...new Set(linked.map((row) => row.connectionId).filter((v): v is string => !!v)),
          ]
          for (const connectionId of connectionIds) {
            // Tenant-scoped: a connection some other tenant owns is skipped,
            // exactly like DELETE /v1/connections/:id would refuse it.
            if (await credentials.deleteForOwner(tenantId, connectionId)) deletedConnections++
          }
        }
        await sessions.detachEndUser(request.params.id)
        await endUsers.deleteById(request.params.id)
        await fire(tenantId, 'customer.deleted', {
          id: request.params.id,
          ...(request.query.cascade === 'connections'
            ? { deleted_connections: deletedConnections }
            : {}),
        })
        return reply.status(204).send()
      },
    )

    // ── Connections (joined via connect_sessions) ──────────────────────────
    fastify.get<{ Params: { id: string } }>(
      '/v1/customers/:id/connections',
      async (request, reply) => {
        if (!(await assertScope(request, reply, 'connections:read'))) return
        const tenantId = tenantOf(request)
        const customer = await endUsers.getById(request.params.id)
        if (!customer || customer.tenantId !== tenantId) {
          return notFound(reply, 'CUSTOMER_NOT_FOUND', `No customer with id ${request.params.id}.`)
        }
        const linkedSessions = await sessions.list({ endUserId: request.params.id })
        const seen = new Set<string>()
        const uniqueSessions = linkedSessions
          .filter((s) => s.connectionId)
          .filter((s) => {
            if (seen.has(s.connectionId!)) return false
            seen.add(s.connectionId!)
            return true
          })
        const data = (
          await Promise.all(uniqueSessions.map(async (s) => credentials.getRow(s.connectionId!)))
        ).filter((c): c is NonNullable<typeof c> => c !== null)
        return { data, meta: { totalCount: data.length, fetchedAt: new Date().toISOString() } }
      },
    )

    // ── Connect link creation ──────────────────────────────────────────────
    fastify.post<{ Params: { id: string } }>(
      '/v1/customers/:id/connect-links',
      async (request, reply) => {
        if (!(await assertScope(request, reply, 'connect-links:write'))) return
        const tenantId = tenantOf(request)
        const parsed = CreateConnectLinkBody.safeParse(request.body ?? {})
        if (!parsed.success) {
          return reply
            .status(400)
            .send({ error: { code: 'VALIDATION', issues: parsed.error.issues } })
        }
        const customer = await endUsers.getById(request.params.id)
        if (!customer || customer.tenantId !== tenantId) {
          return notFound(reply, 'CUSTOMER_NOT_FOUND', `No customer with id ${request.params.id}.`)
        }

        const body = parsed.data
        const allowedVerticals = body.allowedVerticals ?? (body.vertical ? [body.vertical] : [])
        const allowedPlatforms =
          body.allowedPlatforms ??
          (body.platform && body.vertical ? [{ vertical: body.vertical, slug: body.platform }] : [])
        const defaults = opts.linkDefaults?.()
        const expiresAt = body.expiresInSeconds
          ? Date.now() + body.expiresInSeconds * 1000
          : defaults && defaults.expiryHours > 0
            ? Date.now() + defaults.expiryHours * 3_600_000
            : undefined

        // Default to read-only (safe-by-default). An explicit `scopes` array
        // implies 'custom' unless the caller says otherwise.
        const scopePolicy = body.scopePolicy ?? (body.scopes ? 'custom' : 'read_only')

        const session = await sessions.create({
          tenantId,
          label: body.label ?? `Connect link for ${customer.email}`,
          endUserId: customer.id,
          allowedVerticals,
          allowedPlatforms,
          redirectUrl: body.redirectUrl ?? null,
          expiresAt,
          createdBy: 'api',
          oneTimeOnly: body.oneTimeOnly ?? defaults?.oneTimeDefault,
          scopes: body.scopes,
          scopePolicy,
        })

        const baseInputs: { companyBaseUrl?: string | null } = {}
        if (getCompanyBaseUrl) {
          try {
            baseInputs.companyBaseUrl = (await getCompanyBaseUrl()) ?? null
          } catch {
            /* ignore */
          }
        }
        // Same rule as the admin mint path: this URL is forwarded to an
        // end-user's browser, so the compose network's own hostname must never
        // stand in for it. A caller inside that network arrives with
        // `Host: integration-server:3010`; withhold rather than emit an
        // address that resolves nowhere. The session is created either way.
        const base = resolvePublicBaseUrlOrNull(request, baseInputs)
        const url = base ? `${base}/connect/${session.token}` : null
        const unresolved = base ? {} : { urlUnresolved: true as const }
        const payload = { ...session, url, ...unresolved, customerId: customer.id }
        await fire(tenantId, 'connect_link.created', payload)
        return reply.status(201).send({ data: { ...session, url, ...unresolved } })
      },
    )
  }
}
