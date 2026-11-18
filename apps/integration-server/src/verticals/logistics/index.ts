/**
 * Logistics vertical wired into the unified service.
 */
import type { FastifyInstance, FastifyPluginAsync, preHandlerAsyncHookHandler } from 'fastify'
import {
  AdapterRegistry,
  AdapterSettingsStore,
  type DataStoreMode,
  type RawPayloadPolicy,
  type ResourceStore,
  type SyncStore,
  type UnifiedAdapterRegistry,
  type WebhookSubscriptionStore,
  type WebhookDeliveryStore,
  asVerticalRegistry,
  attachDataStoreContext,
  createSyncRouter,
} from '@opensteward/shared'
import { ADAPTER_FACTORIES } from './adapter/factories'
import type { LogisticsAdapter } from './adapter/interface'
import { createCarriersRouter } from './router/carriers'
import { createLabelsRouter } from './router/labels'
import { createManifestsRouter } from './router/manifests'
import { createOrdersRouter } from './router/orders'
import { createPickupsRouter } from './router/pickups'
import { createRatesRouter } from './router/rates'
import { createShipmentsRouter } from './router/shipments'
import { createTrackingEventsRouter } from './router/trackingevents'
import { createWarehousesRouter } from './router/warehouses'

export const VERTICAL = 'logistics'

export function buildLogisticsRegistry(opts: {
  unifiedRegistry: UnifiedAdapterRegistry
  settingsStore: AdapterSettingsStore
}): AdapterRegistry<LogisticsAdapter> {
  const registry = new AdapterRegistry<LogisticsAdapter>({
    vertical: VERTICAL,
    factories: ADAPTER_FACTORIES,
    settingsStore: opts.settingsStore,
  })
  registry.hydrate()
  opts.unifiedRegistry.register(VERTICAL, asVerticalRegistry(registry))
  return registry
}

export interface CreateLogisticsPluginOptions {
  authMiddleware: preHandlerAsyncHookHandler
  /**
   * The license gate for this vertical, added AFTER authMiddleware (401 before
   * 403). Required, so a mount that leaves it out does not compile. The
   * compiler cannot see whether the plugin hooks it in, so
   * tests/server/mount-parity.test.ts pins that line in every plugin.
   */
  licenseGate: (vertical: string) => preHandlerAsyncHookHandler
  mode: DataStoreMode
  resourceStore?: ResourceStore
  syncStore?: SyncStore
  webhookSubs?: WebhookSubscriptionStore
  webhookDeliveries?: WebhookDeliveryStore
  cacheMaxAgeMs?: number
  /** Whether upstream payloads may be kept, read per request. */
  rawPayloadEnabled?: RawPayloadPolicy
  /** Identifies the normalizer that produced a cached record. */
  normalizerVersion?: (vertical: string, platform: string) => string
}

export function createLogisticsPlugin(opts: CreateLogisticsPluginOptions): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    app.addHook('preHandler', opts.authMiddleware)
    app.addHook('preHandler', opts.licenseGate(VERTICAL))
    attachDataStoreContext(app, {
      vertical: VERTICAL,
      mode: opts.mode,
      resourceStore: opts.resourceStore,
      webhookSubs: opts.webhookSubs,
      webhookDeliveries: opts.webhookDeliveries,
      cacheMaxAgeMs: opts.cacheMaxAgeMs,
      rawPayloadEnabled: opts.rawPayloadEnabled,
      normalizerVersion: opts.normalizerVersion,
    })
    await app.register(createCarriersRouter())
    await app.register(createLabelsRouter())
    await app.register(createManifestsRouter())
    await app.register(createOrdersRouter())
    await app.register(createPickupsRouter())
    await app.register(createRatesRouter())
    await app.register(createShipmentsRouter())
    await app.register(createTrackingEventsRouter())
    await app.register(createWarehousesRouter())

    if (opts.mode !== 'passthrough' && opts.syncStore) {
      await app.register(createSyncRouter({ vertical: VERTICAL, syncStore: opts.syncStore }))
    }
  }
}

export type { LogisticsAdapter }
