/**
 * Vertical plugin helper — attaches data-store context (mode, resource
 * store, per-request event emitter) onto every request that survives the
 * auth middleware. Each vertical's `createXPlugin` calls this once instead
 * of duplicating the same `preHandler` body four times.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { ResourceStore, RawPayloadPolicy } from './resource-store'
import type { DataStoreMode } from './cached-router-helpers'
import type { WebhookSubscriptionStore } from '../auth/webhook-subscriptions'
import type { WebhookDeliveryStore } from '../auth/webhook-deliveries'
import { emitTenantEvent } from '../control-plane/event-emitter'

export interface AttachDataStoreContextOptions {
  vertical: string
  mode: DataStoreMode
  resourceStore?: ResourceStore
  webhookSubs?: WebhookSubscriptionStore
  webhookDeliveries?: WebhookDeliveryStore
  /** Stale-cache TTL in ms. Cached rows older than this are treated as
   *  a miss. Undefined = no TTL (manual invalidation only). */
  cacheMaxAgeMs?: number
  /**
   * Whether this vertical's upstream payload may be kept. The store applies it
   * to reads and writes; the router helpers need it too, because passthrough
   * responses and outbound webhook bodies never touch the store.
   */
  rawPayloadEnabled?: RawPayloadPolicy
  /**
   * Identifies the normalizer that produced a cached record, so a transform
   * change invalidates exactly the rows it affects instead of leaving them to
   * be served in the previous build's shape.
   */
  normalizerVersion?: (vertical: string, platform: string) => string
}

export function attachDataStoreContext(
  app: FastifyInstance,
  opts: AttachDataStoreContextOptions,
): void {
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const r = request as unknown as Record<string, unknown>

    // The auth middleware is ONE shared instance mounted by every vertical
    // plugin, so it cannot know which route a request landed on — it resolves
    // the adapter from the connection row's vertical alone. That makes a
    // cross-vertical call (a CRM tool with an accounting connection_id) reach
    // the CRM router carrying an accounting adapter, where the ordinary
    // `!adapter.listDeals` guard reports 501 — the same code that legitimately
    // means "in this vertical, but unmapped for this platform". The client
    // cannot tell "never call this again" from "not shipped yet".
    //
    // This hook is the one place both facts exist: the connection's vertical
    // (attached by auth, just above) and the vertical this plugin was mounted
    // with. Compare them BEFORE the assignment below overwrites the former —
    // that overwrite is what destroyed the evidence.
    //
    // A route that resolved no connection has nothing to mismatch, so absence
    // passes through.
    const connectionVertical = r['vertical'] as string | undefined
    if (connectionVertical && connectionVertical !== opts.vertical) {
      await reply.status(400).send({
        error: {
          code: 'VERTICAL_MISMATCH',
          message:
            `This connection belongs to the '${connectionVertical}' vertical, but this ` +
            `endpoint serves '${opts.vertical}'. Use a '${opts.vertical}' connection, or call ` +
            `the '${connectionVertical}' endpoint for this connection.`,
          connectionVertical,
          endpointVertical: opts.vertical,
        },
      })
      return reply
    }

    r['cacheMode'] = opts.mode
    r['resourceStore'] = opts.resourceStore
    r['vertical'] = opts.vertical
    // The router helpers report cache status as response headers, and they
    // receive only the request — Fastify has no request→reply pointer, so
    // hand it over here rather than re-threading every call site.
    r['cacheReply'] = reply
    if (opts.cacheMaxAgeMs !== undefined) r['cacheMaxAgeMs'] = opts.cacheMaxAgeMs
    if (opts.rawPayloadEnabled) r['rawPayloadEnabled'] = opts.rawPayloadEnabled
    if (opts.normalizerVersion) r['normalizerVersion'] = opts.normalizerVersion

    if (opts.mode === 'external' && opts.webhookSubs) {
      const tenantId = (r['tenantId'] as string | undefined) ?? null
      if (tenantId) {
        const subs = opts.webhookSubs
        const deliveries = opts.webhookDeliveries
        r['dataStoreEvents'] = {
          emit(op: 'upsert' | 'delete', args: Record<string, unknown>) {
            const type = op === 'delete' ? 'resource.deleted' : 'resource.updated'
            emitTenantEvent(
              subs,
              tenantId,
              type,
              {
                vertical: args['vertical'],
                platform: args['platform'],
                connection_id: args['connectionId'],
                resource_type: args['resourceType'],
                resource_id: args['resourceId'],
                data: args['data'],
                fetched_at: args['fetchedAt'],
                op,
              },
              { deliveries },
            )
          },
        }
      }
    }
  })
}
