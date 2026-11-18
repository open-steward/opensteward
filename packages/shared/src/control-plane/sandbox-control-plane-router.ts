/**
 * Test-mode control plane: the customer / connection / webhook-subscription /
 * event surface, under `/test/v1`, backed by DETERMINISTIC pre-seeded mock
 * data so a developer can exercise every developer-API endpoint with an
 * `osk_test_` key — not just the vertical resource routes.
 *
 * The live versions of these routers (`customers-router`, `connections-dev-
 * router`, `webhook-subs-dev-router`, `inbound-events-router`) are live-only:
 * their `requireTenantKey` defaults to `mode: 'live'`, and they read real
 * CredentialStore / EndUserStore / WebhookSubscriptionStore rows — none of
 * which exist in the sandbox. Rather than entangle those routers with sandbox
 * logic, this is a dedicated sibling (the same choice the vertical sandbox made
 * with its own adapter): pre-seeded reads, canned writes, and NO network.
 *
 * NO EGRESS. Like `sandbox-meta-router`, this imports the LEAF `resolveApiKey`
 * (not `api-key-middleware`, which reaches the OIDC verifier → `safe-fetch`),
 * so `check:sandbox-egress` can prove the whole `/test/v1` subtree is
 * network-free. The webhook `/test` send here is simulated; it never dials.
 *
 * Seed data is derived from `(tenantId, …)` via UUIDv5 exactly like
 * `sandboxConnectionId`, so it is stable across restarts and replicas and needs
 * no storage. Responses are shaped to the same canonical schemas the live
 * routers return (Customer / Connection / WebhookSubscription / event), so the
 * SDK and generated spec stay honest across the live↔test boundary.
 */
import { createHash, randomUUID } from 'node:crypto'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import type { ApiKeyStore } from '../auth/api-keys'
import { hasScope } from '../auth/api-keys'
// Leaf module — see the no-egress note above and in sandbox-auth-middleware.ts.
import {
  requireSandboxCredential,
  resolveSandboxCredential,
  type SandboxOauthOptions,
} from './sandbox-credential'
import type { RateLimitConfigSource } from './api-key-middleware'
import { consume, DEFAULT_API_KEY_RATE_LIMIT } from './rate-limit'
import { sandboxConnectionId } from '../sandbox/ids'
import { resolvePublicBaseUrlOrNull } from './public-base-url'
import { encodeSandboxLinkToken } from './sandbox-link-token'

export interface SandboxControlPlaneRouterOptions {
  apiKeys: ApiKeyStore
  /** Accept the deployment's test-issuer tokens as well as test keys. */
  oauth?: SandboxOauthOptions
  /** Verticals with a sandbox mount — the connections a test key "has". */
  verticals: readonly string[]
  testModeEnabled?: () => boolean
  rateLimit?: RateLimitConfigSource
  /** Injected company base URL (admin Company Info) for emitted link URLs —
   *  a VALUE getter, so no store/network reach from the sandbox subtree. */
  getCompanyBaseUrl?: () => Promise<string | null> | string | null
  /**
   * The verticals the deployment's license includes, as a getter VALUE
   * (integration-server injects it; nothing from licensing is imported here, so
   * this subtree stays egress-free). Omitted: every sandbox vertical.
   */
  enabledVerticals?: () => readonly string[]
}

/** Fixed namespace (shared with sandbox connection ids) for derived seed ids. */
const NS = '6f9619ff-8b86-d011-b42d-00c04fc964ff'
/** A pinned instant so seeded records have stable timestamps. */
const SEED_TS = Date.parse('2026-01-01T00:00:00.000Z')

function uuid5(name: string): string {
  const ns = Buffer.from(NS.replace(/-/g, ''), 'hex')
  const hash = createHash('sha1').update(ns).update(Buffer.from(name, 'utf8')).digest()
  const b = Buffer.from(hash.subarray(0, 16))
  b[6] = (b[6]! & 0x0f) | 0x50
  b[8] = (b[8]! & 0x3f) | 0x80
  const h = b.toString('hex')
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join(
    '-',
  )
}

// ── Deterministic seed data ──────────────────────────────────────────────────

function seedCustomers(tenantId: string) {
  return [0, 1].map((i) => ({
    id: uuid5(`${tenantId}:customer:${i}`),
    tenantId,
    email: `sandbox-customer-${i + 1}@example.test`,
    displayName: i === 0 ? 'Ada Sandbox' : 'Grace Sandbox',
    externalReference: `ext-${i + 1}`,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  }))
}

function seedConnectionFor(tenantId: string, vertical: string) {
  return {
    id: sandboxConnectionId(tenantId, vertical),
    platform: 'sandbox',
    vertical,
    tenantId,
    ownerTenantId: tenantId,
    label: `${vertical} sandbox`,
    status: 'active',
    expiresAt: null as number | null,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  }
}

function seedConnections(tenantId: string, verticals: readonly string[]) {
  return verticals.map((v) => seedConnectionFor(tenantId, v))
}

function seedSubscription(tenantId: string) {
  return {
    id: uuid5(`${tenantId}:webhook:0`),
    tenantId,
    url: 'https://webhooks.example.test/sandbox',
    label: 'Sandbox subscription',
    events: ['*'],
    format: 'opensteward' as const,
    headerNames: [] as string[],
    paused: false,
    createdAt: SEED_TS,
    lastFiredAt: null as number | null,
    lastStatus: null as number | null,
  }
}

/**
 * The curated sandbox platform catalog: one synthetic `sandbox` entry per
 * vertical. Deliberately NOT the real ~1,353-platform catalog — the sandbox
 * serves exactly the platforms its connections use, so what a test key lists
 * under `/test/v1/connections` is explained by what it lists here. Schema-valid
 * against the spec's `Platform` shape; always `enabled: true`; zero DB reads.
 * (Adding a `sandbox` row to a vertical's real metadata.ts would leak it into
 * the live catalog and Connect Link pickers — synthesized here instead.)
 */
function sandboxPlatform(vertical: string) {
  const title = vertical
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
  return {
    slug: 'sandbox',
    vertical,
    name: `${title} Sandbox`,
    description:
      `Synthetic no-egress sandbox platform for ${vertical}. ` +
      'Serves deterministic fixture data; never contacts an upstream.',
    website: 'https://example.test',
    category: 'sandbox',
    auth_type: 'oauth2',
    primary_color: '#0f766e',
    enabled: true,
  }
}

function seedEvents(tenantId: string) {
  return [1, 2].map((seq) => ({
    seq,
    id: uuid5(`${tenantId}:event:${seq}`),
    tenantId,
    vertical: 'accounting',
    platform: 'sandbox',
    connectionId: sandboxConnectionId(tenantId, 'accounting'),
    eventType: seq === 1 ? 'invoice.created' : 'invoice.updated',
    resourceType: 'invoices',
    action: seq === 1 ? 'created' : 'updated',
    resourceId: 'inv_1042',
    receivedAt: SEED_TS,
    payload: { id: 'inv_1042', event: seq === 1 ? 'created' : 'updated' },
  }))
}

// ── Router ───────────────────────────────────────────────────────────────────

function tenantOf(request: FastifyRequest): string {
  return (request as unknown as { tenantId: string }).tenantId
}
function scopesOf(request: FastifyRequest): string[] {
  return (request as unknown as { apiKeyScopes?: string[] }).apiKeyScopes ?? []
}
function notFound(reply: FastifyReply, code: string, message: string) {
  return reply.status(404).send({ error: { code, message } })
}
async function requireScope(
  request: FastifyRequest,
  reply: FastifyReply,
  scope: string,
): Promise<boolean> {
  if (hasScope(scopesOf(request), scope)) return true
  // Awaited: an un-awaited send races the handler's own return and trips
  // Fastify's "reply already sent" guard.
  await reply.status(403).send({
    error: {
      code: 'INSUFFICIENT_SCOPE',
      message: `Scope '${scope}' required.`,
      requiredScope: scope,
    },
  })
  return false
}

export function createSandboxControlPlaneRouter(
  opts: SandboxControlPlaneRouterOptions,
): FastifyPluginAsync {
  const { apiKeys, verticals } = opts
  const rateLimitSource = opts.rateLimit ?? DEFAULT_API_KEY_RATE_LIMIT

  return async (fastify) => {
    // Same auth preHandler shape as sandbox-meta-router: test-mode gate, leaf
    // key check, shared budget. No connection_id — these are tenant-scoped
    // control-plane routes, not vertical resource routes.
    fastify.addHook('preHandler', async (request, reply) => {
      if (opts.testModeEnabled && !opts.testModeEnabled()) {
        await reply.status(503).send({
          error: {
            code: 'TEST_MODE_DISABLED',
            message:
              'Test mode is disabled on this deployment. An operator set ' +
              'features.test_mode_enabled = false.',
          },
        })
        return reply
      }
      // Test key or test-issuer token — see sandbox-credential.ts.
      const result = await resolveSandboxCredential(request, reply, apiKeys, opts.oauth)
      if (result === false) return reply
      if (!result) {
        await requireSandboxCredential(reply)
        return reply
      }
      const rateLimit =
        typeof rateLimitSource === 'function' ? rateLimitSource(request) : rateLimitSource
      const rl = await consume(result.apiKeyId, rateLimit)
      if (!rl.ok) {
        const retrySec = Math.ceil(rl.retryAfterMs / 1000)
        reply.header('retry-after', String(retrySec))
        await reply.status(429).send({
          error: { code: 'RATE_LIMITED', message: `Rate limit exceeded — retry in ${retrySec}s.` },
        })
        return reply
      }
      const r = request as unknown as Record<string, unknown>
      r['tenantId'] = result.tenantId
      r['apiKeyScopes'] = result.scopes
      return
    })

    // ── Customers ────────────────────────────────────────────────────────────
    fastify.get('/customers', async (request, reply) => {
      if (!(await requireScope(request, reply, 'customers:read'))) return
      const data = seedCustomers(tenantOf(request))
      return reply.send({ data, meta: { totalCount: data.length } })
    })

    fastify.post<{ Body: { email?: string; displayName?: string; externalReference?: string } }>(
      '/customers',
      async (request, reply) => {
        if (!(await requireScope(request, reply, 'customers:write'))) return
        const body = request.body ?? {}
        // Canned create: echo a schema-valid customer with a fresh id. Not
        // persisted — reads always return the deterministic seed set.
        return reply.status(201).send({
          data: {
            id: randomUUID(),
            tenantId: tenantOf(request),
            email: body.email ?? 'new-sandbox-customer@example.test',
            displayName: body.displayName ?? null,
            externalReference: body.externalReference ?? null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        })
      },
    )

    fastify.get<{ Params: { id: string } }>('/customers/:id', async (request, reply) => {
      if (!(await requireScope(request, reply, 'customers:read'))) return
      const found = seedCustomers(tenantOf(request)).find((c) => c.id === request.params.id)
      if (!found)
        return notFound(reply, 'CUSTOMER_NOT_FOUND', `No customer with id ${request.params.id}.`)
      return reply.send({ data: found })
    })

    fastify.patch<{ Params: { id: string }; Body: { displayName?: string } }>(
      '/customers/:id',
      async (request, reply) => {
        if (!(await requireScope(request, reply, 'customers:write'))) return
        const found = seedCustomers(tenantOf(request)).find((c) => c.id === request.params.id)
        if (!found)
          return notFound(reply, 'CUSTOMER_NOT_FOUND', `No customer with id ${request.params.id}.`)
        return reply.send({
          data: {
            ...found,
            displayName: request.body?.displayName ?? found.displayName,
            updatedAt: Date.now(),
          },
        })
      },
    )

    fastify.delete<{ Params: { id: string } }>('/customers/:id', async (request, reply) => {
      if (!(await requireScope(request, reply, 'customers:write'))) return
      const found = seedCustomers(tenantOf(request)).find((c) => c.id === request.params.id)
      if (!found)
        return notFound(reply, 'CUSTOMER_NOT_FOUND', `No customer with id ${request.params.id}.`)
      return reply.status(204).send()
    })

    fastify.get<{ Params: { id: string } }>(
      '/customers/:id/connections',
      async (request, reply) => {
        if (!(await requireScope(request, reply, 'connections:read'))) return
        const tenantId = tenantOf(request)
        if (!seedCustomers(tenantId).some((c) => c.id === request.params.id))
          return notFound(reply, 'CUSTOMER_NOT_FOUND', `No customer with id ${request.params.id}.`)
        const data = seedConnections(tenantId, verticals)
        return reply.send({ data, meta: { totalCount: data.length } })
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/customers/:id/connect-links',
      async (request, reply) => {
        if (!(await requireScope(request, reply, 'connect-links:write'))) return
        const tenantId = tenantOf(request)
        if (!seedCustomers(tenantId).some((c) => c.id === request.params.id))
          return notFound(reply, 'CUSTOMER_NOT_FOUND', `No customer with id ${request.params.id}.`)
        // A real, openable link: the token is self-describing (tenant +
        // seeded customer, deterministic) and the URL points at the hosted
        // MOCK connect flow served by sandbox-auth-router. Same withhold-
        // rather-than-mislead rule as the live mint: a compose-internal
        // hostname is never emitted (`urlUnresolved` instead).
        const token = encodeSandboxLinkToken(tenantId, request.params.id)
        let companyBaseUrl: string | null = null
        try {
          companyBaseUrl = (await opts.getCompanyBaseUrl?.()) ?? null
        } catch {
          companyBaseUrl = null
        }
        const base = resolvePublicBaseUrlOrNull(request, { companyBaseUrl })
        const url = base ? `${base}/test/v1/connect/${token}` : null
        const unresolved = base ? {} : { urlUnresolved: true as const }
        return reply.status(201).send({
          data: {
            token,
            url,
            ...unresolved,
            // The mock flow does not enforce expiry (the token is
            // deterministic); this mirrors the live 24h default shape.
            expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
            sandbox: true,
            note: 'Sandbox link — open the URL to run the hosted mock connect flow.',
          },
        })
      },
    )

    // ── Platforms (curated: one synthetic `sandbox` entry per vertical) ──────
    // Mirrors the live `/v1/platforms` query surface (?vertical/?search/
    // ?enabled) and response shape, over the curated set. No scope check —
    // the live route has none beyond authentication either.
    fastify.get<{ Querystring: { vertical?: string; search?: string; enabled?: string } }>(
      '/platforms',
      async (request, reply) => {
        let out = verticals.map(sandboxPlatform)
        const { vertical, search, enabled } = request.query
        if (vertical) out = out.filter((p) => p.vertical === vertical)
        if (search) {
          const q = search.toLowerCase()
          out = out.filter(
            (p) => p.slug.toLowerCase().includes(q) || p.name.toLowerCase().includes(q),
          )
        }
        // Every sandbox platform is always enabled.
        if (enabled === 'false') out = []
        return reply.send({ data: out })
      },
    )

    // ── Capabilities: mirrors live GET /v1/capabilities ─────────────────────
    fastify.get('/capabilities', async (_request, reply) => {
      const enabled = opts.enabledVerticals ? new Set(opts.enabledVerticals()) : null
      return reply.send({
        data: { verticals: verticals.filter((v) => !enabled || enabled.has(v)).sort() },
      })
    })

    fastify.get<{ Params: { vertical: string; slug: string } }>(
      '/platforms/:vertical/:slug',
      async (request, reply) => {
        const { vertical, slug } = request.params
        if (slug !== 'sandbox' || !verticals.includes(vertical)) {
          // Live 404 body, verbatim.
          return reply.status(404).send({ error: 'Platform not found' })
        }
        return reply.send({ data: sandboxPlatform(vertical) })
      },
    )

    // ── Connections (list is owned by the sandbox meta router) ───────────────
    fastify.get<{ Params: { id: string } }>('/connections/:id', async (request, reply) => {
      if (!(await requireScope(request, reply, 'connections:read'))) return
      const tenantId = tenantOf(request)
      const vertical = verticals.find((v) => sandboxConnectionId(tenantId, v) === request.params.id)
      if (!vertical)
        return notFound(
          reply,
          'CONNECTION_NOT_FOUND',
          `No connection with id ${request.params.id}.`,
        )
      return reply.send({ data: seedConnectionFor(tenantId, vertical) })
    })

    fastify.patch<{ Params: { id: string }; Body: { label?: string } }>(
      '/connections/:id',
      async (request, reply) => {
        if (!(await requireScope(request, reply, 'connections:write'))) return
        const tenantId = tenantOf(request)
        const vertical = verticals.find(
          (v) => sandboxConnectionId(tenantId, v) === request.params.id,
        )
        if (!vertical)
          return notFound(
            reply,
            'CONNECTION_NOT_FOUND',
            `No connection with id ${request.params.id}.`,
          )
        return reply.send({
          data: {
            ...seedConnectionFor(tenantId, vertical),
            label: request.body?.label ?? `${vertical} sandbox`,
            updatedAt: Date.now(),
          },
        })
      },
    )

    fastify.delete<{ Params: { id: string } }>('/connections/:id', async (request, reply) => {
      if (!(await requireScope(request, reply, 'connections:write'))) return
      const tenantId = tenantOf(request)
      const vertical = verticals.find((v) => sandboxConnectionId(tenantId, v) === request.params.id)
      if (!vertical)
        return notFound(
          reply,
          'CONNECTION_NOT_FOUND',
          `No connection with id ${request.params.id}.`,
        )
      return reply.status(204).send()
    })

    // ── Webhook subscriptions ────────────────────────────────────────────────
    const subId = (tenantId: string) => seedSubscription(tenantId).id

    fastify.get('/webhook-subscriptions', async (request, reply) => {
      if (!(await requireScope(request, reply, 'webhooks:read'))) return
      const data = [seedSubscription(tenantOf(request))]
      return reply.send({ data, meta: { totalCount: data.length } })
    })

    fastify.post<{ Body: { url?: string; label?: string; events?: string[]; format?: string } }>(
      '/webhook-subscriptions',
      async (request, reply) => {
        if (!(await requireScope(request, reply, 'webhooks:write'))) return
        const body = request.body ?? {}
        return reply.status(201).send({
          data: {
            id: randomUUID(),
            tenantId: tenantOf(request),
            url: body.url ?? 'https://webhooks.example.test/new',
            label: body.label ?? null,
            events: body.events ?? ['*'],
            format: body.format ?? 'opensteward',
            headerNames: [],
            paused: false,
            createdAt: Date.now(),
            lastFiredAt: null,
            lastStatus: null,
            // Shown once, like the live create. Synthetic — never signs anything.
            secret: `whsec_sandbox_${randomUUID().replace(/-/g, '')}`,
          },
        })
      },
    )

    const withSub = (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ): boolean => {
      if (request.params.id !== subId(tenantOf(request))) {
        notFound(
          reply,
          'WEBHOOK_SUB_NOT_FOUND',
          `No webhook subscription with id ${request.params.id}.`,
        )
        return false
      }
      return true
    }

    fastify.get<{ Params: { id: string } }>(
      '/webhook-subscriptions/:id',
      async (request, reply) => {
        if (!(await requireScope(request, reply, 'webhooks:read'))) return
        if (!withSub(request, reply)) return
        return reply.send({ data: seedSubscription(tenantOf(request)) })
      },
    )

    fastify.patch<{ Params: { id: string }; Body: { label?: string } }>(
      '/webhook-subscriptions/:id',
      async (request, reply) => {
        if (!(await requireScope(request, reply, 'webhooks:write'))) return
        if (!withSub(request, reply)) return
        return reply.send({
          data: {
            ...seedSubscription(tenantOf(request)),
            label: request.body?.label ?? 'Sandbox subscription',
          },
        })
      },
    )

    fastify.delete<{ Params: { id: string } }>(
      '/webhook-subscriptions/:id',
      async (request, reply) => {
        if (!(await requireScope(request, reply, 'webhooks:write'))) return
        if (!withSub(request, reply)) return
        return reply.status(204).send()
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/webhook-subscriptions/:id/test',
      async (request, reply) => {
        if (!(await requireScope(request, reply, 'webhooks:write'))) return
        if (!withSub(request, reply)) return
        // Simulated — the sandbox makes no outbound requests (no egress).
        return reply.send({
          data: {
            id: request.params.id,
            ok: true,
            status: 200,
            format: 'opensteward',
            simulated: true,
          },
        })
      },
    )

    fastify.post<{ Params: { id: string }; Body: { paused?: boolean } }>(
      '/webhook-subscriptions/:id/paused',
      async (request, reply) => {
        if (!(await requireScope(request, reply, 'webhooks:write'))) return
        if (!withSub(request, reply)) return
        return reply.send({ data: { id: request.params.id, paused: request.body?.paused ?? true } })
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/webhook-subscriptions/:id/rotate-secret',
      async (request, reply) => {
        if (!(await requireScope(request, reply, 'webhooks:write'))) return
        if (!withSub(request, reply)) return
        return reply.send({
          data: {
            id: request.params.id,
            secret: `whsec_sandbox_${randomUUID().replace(/-/g, '')}`,
          },
        })
      },
    )

    fastify.get<{ Params: { id: string } }>(
      '/webhook-subscriptions/:id/deliveries',
      async (request, reply) => {
        if (!(await requireScope(request, reply, 'webhooks:read'))) return
        if (!withSub(request, reply)) return
        // No real deliveries in the sandbox (nothing is dialed).
        return reply.send({ data: [] })
      },
    )

    // ── Events ───────────────────────────────────────────────────────────────
    fastify.get<{ Querystring: { after_seq?: string; limit?: string } }>(
      '/events',
      async (request, reply) => {
        if (!(await requireScope(request, reply, 'events:read'))) return
        const afterSeq = request.query.after_seq ? Number(request.query.after_seq) : 0
        const all = seedEvents(tenantOf(request))
        const rows = all.filter((e) => e.seq > (Number.isFinite(afterSeq) ? afterSeq : 0))
        const nextCursor = rows.length ? rows[rows.length - 1]!.seq : afterSeq
        return reply.send({
          data: rows,
          meta: {
            next_cursor: nextCursor,
            count: rows.length,
            fetchedAt: new Date().toISOString(),
          },
        })
      },
    )
  }
}
