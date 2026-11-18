/**
 * Unified webhooks router — normalises inbound webhooks for every
 * (vertical, platform) pair the service knows about.
 *
 * Flow:
 *   POST /webhooks/{vertical}/{platform}
 *     1. Reads raw body as Buffer (required for HMAC verification).
 *     2. Looks up handlers[vertical][platform].
 *     3. Calls handler.verifyWebhook() — returns 401 on signature failure.
 *        A handler with verifyWebhookWithContext() is verified by that
 *        instead (async, per-connection context, names the owner itself).
 *     4. Calls handler.parseWebhookEvents() to get canonical events.
 *     5. Fans out each event across matching stored connections (same
 *        (vertical, platform, tenantId) can map to multiple connections).
 *     6. If `callbackUrl` is set, POSTs the fanned-out event list there.
 *     7. Responds 200 { received: true, eventCount }.
 */
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { CredentialStore, ConnectionRow } from '../auth/store'
import type {
  WebhookContextVerification,
  WebhookHandler,
  WebhookVerificationCandidate,
} from '../webhook'
import type { WebhookAdapterConfig } from '../config/base-config'
import type { InboundConsumeInput } from './webhook-consumer'

export interface WebhookConfig {
  /** If set, parsed events are POSTed here as `{ events: [...] }`. */
  callbackUrl?: string
  /** Per-(vertical, platform) signing secrets. */
  adapters?: Record<string, Record<string, WebhookAdapterConfig | undefined> | undefined>
}

export interface UnifiedWebhooksRouterOptions {
  /** `handlers[vertical][platform]` — each platform that ships a handler. */
  handlers: Record<string, Record<string, WebhookHandler | undefined> | undefined>
  store: CredentialStore
  config?: WebhookConfig
  /** In-process sink for verified events (stream + outbound bridge + cache
   *  refresh). When omitted, only the optional `callbackUrl` forward runs. */
  consumer?: { consume(input: InboundConsumeInput): Promise<void> }
}

interface CanonicalEvent {
  tenantId?: string | null
  connectionId?: string
  /** Platform's external account identifier (Stripe `acct_…`, Shopify shop
   *  domain, Xero tenant id). Used to resolve the owning connection. */
  externalAccountId?: string
  [key: string]: unknown
}

async function forwardEvents(
  callbackUrl: string,
  events: CanonicalEvent[],
  log: FastifyRequest['log'],
): Promise<void> {
  try {
    const res = await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    })
    if (!res.ok) {
      log.warn({ callbackUrl, status: res.status }, 'webhook forward failed')
    }
  } catch (err) {
    log.warn({ callbackUrl, err }, 'webhook forward error')
  }
}

export function createUnifiedWebhooksRouter(
  opts: UnifiedWebhooksRouterOptions,
): FastifyPluginAsync {
  return async (fastify: FastifyInstance) => {
    // Raw-body capture for HMAC verification. Scoped to this plugin so other
    // routers keep receiving parsed JSON.
    fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
      done(null, body)
    })

    fastify.post<{ Params: { vertical: string; platform: string } }>(
      '/webhooks/:vertical/:platform',
      async (request, reply) => {
        const { vertical, platform } = request.params
        const handler = opts.handlers[vertical]?.[platform]

        if (!handler) {
          // 501 (Not Implemented) — the route exists but no verifier
          // is wired for this (vertical, platform) pair. Fail-closed:
          // we'd rather reject a legitimate platform that's missing a
          // verifier than accept unsigned bodies.
          return reply.status(501).send({
            error: {
              code: 'WEBHOOK_HANDLER_NOT_FOUND',
              message: `No webhook handler for ${vertical}/${platform}.`,
            },
          })
        }

        const rawBody = request.body as Buffer
        const headers = Object.fromEntries(
          Object.entries(request.headers).map(([k, v]) => [
            k.toLowerCase(),
            Array.isArray(v) ? (v[0] ?? '') : (v ?? ''),
          ]),
        )

        // Header-sourced account id (e.g. Shopify shop domain) can be read
        // BEFORE verification — it's untrusted until the signature passes, but
        // it lets us pick the right per-connection secret to verify against.
        const headerAccountId = handler.extractAccountId?.(rawBody, headers)
        const staticSecret = opts.config?.adapters?.[vertical]?.[platform]?.secret ?? ''
        const conns = await opts.store.findByVertical(vertical, platform)

        let verifiedConn: ConnectionRow | null = null
        let verified = false
        // Set only on the async path: every event goes to verifiedConn, and
        // the consumer learns whether the body itself was covered by the proof.
        let pinnedToVerified = false
        let bodyAuthenticated = true

        if (handler.verifyWebhookWithContext) {
          // Async, context-aware verification (see WebhookHandler). It replaces
          // verifyWebhook entirely: no static-secret fallback, and the handler
          // must name the owning connection itself. Null, a throw, or an id that
          // is not one of this (vertical, platform)'s connections all fail closed.
          const candidates: WebhookVerificationCandidate[] = []
          for (const c of conns) {
            const creds = await opts.store.loadById(c.id)
            if (!creds) continue
            candidates.push({
              connectionId: c.id,
              extra: creds.extra ?? {},
              ...(creds.webhookSecret ? { webhookSecret: creds.webhookSecret } : {}),
            })
          }
          let result: WebhookContextVerification | null = null
          try {
            result = await handler.verifyWebhookWithContext(rawBody, headers, candidates)
          } catch (err) {
            request.log.warn({ vertical, platform, err }, 'webhook context verification threw')
          }
          // The owner must be one of this (vertical, platform)'s connections.
          const ownerId = result?.connectionId
          const owner = ownerId === undefined ? undefined : conns.find((c) => c.id === ownerId)
          if (result && owner) {
            verified = true
            verifiedConn = owner
            pinnedToVerified = true
            bodyAuthenticated = result.bodyAuthenticated === true
          }
        } else {
          // Secret selection + verification. Per-connection secrets isolate
          // tenants who connect the same platform; the static config secret is
          // the fallback for platforms with one global secret. When a
          // per-connection secret verifies, that connection IS the owner — which
          // also resolves the verify-before-route chicken-and-egg.
          // Empty static secret is still passed through (unconfigured adapters
          // verify with key ''); per-connection candidates are guarded by a
          // truthy `perConn` check before calling this.
          const tryWith = (s: string): boolean => handler.verifyWebhook(rawBody, headers, s)

          const acctConn = headerAccountId
            ? await opts.store.findByExternalAccount(platform, headerAccountId, vertical)
            : null
          if (acctConn) {
            const perConn = await opts.store.getWebhookSecret(acctConn.id)
            if ((perConn && tryWith(perConn)) || tryWith(staticSecret)) {
              verified = true
              verifiedConn = acctConn
            }
          } else if (conns.length === 1) {
            const only = conns[0]!
            const perConn = await opts.store.getWebhookSecret(only.id)
            if ((perConn && tryWith(perConn)) || tryWith(staticSecret)) {
              verified = true
              verifiedConn = only
            }
          } else if (conns.length > 1) {
            // Try each connection's own secret; the one that verifies is the owner.
            for (const c of conns) {
              const perConn = await opts.store.getWebhookSecret(c.id)
              if (perConn && tryWith(perConn)) {
                verified = true
                verifiedConn = c
                break
              }
            }
            if (!verified && tryWith(staticSecret)) verified = true
          } else if (tryWith(staticSecret)) {
            verified = true
          }
        }

        if (!verified) {
          request.log.warn({ vertical, platform }, 'webhook signature verification failed')
          return reply.status(401).send({
            error: { code: 'INVALID_WEBHOOK_SIGNATURE', message: 'Invalid webhook signature.' },
          })
        }

        let events: CanonicalEvent[] = []
        try {
          const json = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>
          events = (
            handler.parseWebhookEventsWithHeaders
              ? handler.parseWebhookEventsWithHeaders(json, headers)
              : handler.parseWebhookEvents(json)
          ) as CanonicalEvent[]
        } catch (err) {
          request.log.warn({ vertical, platform, err }, 'webhook body parse error')
          return reply.status(400).send({
            error: { code: 'INVALID_JSON', message: 'Invalid JSON body.' },
          })
        }

        // Resolve each event to exactly ONE owning connection — FAIL CLOSED.
        // Resolution order:
        //   1. external account id (Stripe acct, Shopify shop, Xero tenant) → its connection
        //   2. the connection whose secret verified the signature
        //   3. exactly one connection exists for (vertical, platform) → use it
        //   4. otherwise DROP the event (never broadcast to every connection)
        const fannedOut: CanonicalEvent[] = []
        let dropped = 0
        for (const event of events) {
          if (pinnedToVerified) {
            // Async-verified: the handler named the owner. Nothing from the
            // body (which the proof may not cover) can redirect the event.
            fannedOut.push({ ...event, connectionId: verifiedConn!.id })
            continue
          }
          const acctId = event.externalAccountId ?? headerAccountId
          let conn = acctId
            ? await opts.store.findByExternalAccount(platform, acctId, vertical)
            : null
          if (!conn) conn = verifiedConn
          if (!conn && conns.length === 1) conn = conns[0] ?? null
          if (!conn) {
            dropped++
            continue
          }
          fannedOut.push({ ...event, connectionId: conn.id })
        }
        if (dropped > 0) {
          request.log.warn(
            { vertical, platform, dropped },
            'webhook events dropped — could not resolve to a single connection (link an external account id, or ensure only one connection exists)',
          )
        }

        request.log.info(
          { vertical, platform, eventCount: fannedOut.length, originalCount: events.length },
          'webhook received',
        )

        // In-process sink: stream + outbound bridge + cache refresh. Fire and
        // forget so the platform gets a fast 200; the consumer is idempotent.
        if (opts.consumer) {
          for (const ev of fannedOut) {
            if (!ev.connectionId) continue
            void opts.consumer.consume({
              vertical,
              platform,
              connectionId: ev.connectionId,
              event: {
                type: String(ev['type'] ?? ''),
                resourceType: String(ev['resourceType'] ?? 'unknown'),
                action: String(ev['action'] ?? 'unknown'),
                resourceId: String(ev['resourceId'] ?? ''),
                id: ev['id'] != null ? String(ev['id']) : undefined,
                payload: ev['payload'] ?? ev,
              },
              rawBody,
              // Only the async path can report an unsigned body; every other
              // handler leaves the consumer input exactly as before.
              ...(bodyAuthenticated ? {} : { bodyAuthenticated: false as const }),
            })
          }
        }

        if (opts.config?.callbackUrl && fannedOut.length > 0) {
          forwardEvents(opts.config.callbackUrl, fannedOut, request.log).catch(() => undefined)
        }

        return reply.status(200).send({ received: true, eventCount: fannedOut.length })
      },
    )
  }
}
