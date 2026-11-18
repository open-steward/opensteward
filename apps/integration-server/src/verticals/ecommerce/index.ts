/**
 * Ecommerce vertical wired into the unified service.
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
import type { EcommerceAdapter } from './adapter/interface'
import { createCollectionsRouter } from './router/collections'
import { createCustomersRouter } from './router/customers'
import { createDiscountsRouter } from './router/discounts'
import { createFulfillmentsRouter } from './router/fulfillments'
import { createInventoryRouter } from './router/inventory'
import { createLocationsRouter } from './router/locations'
import { createOrdersRouter } from './router/orders'
import { createProductsRouter } from './router/products'
import { createRefundsRouter } from './router/refunds'
import { createTransactionsRouter } from './router/transactions'
import { createVariantsRouter } from './router/variants'

export const VERTICAL = 'ecommerce'

export function buildEcommerceRegistry(opts: {
  unifiedRegistry: UnifiedAdapterRegistry
  settingsStore: AdapterSettingsStore
}): AdapterRegistry<EcommerceAdapter> {
  const registry = new AdapterRegistry<EcommerceAdapter>({
    vertical: VERTICAL,
    factories: ADAPTER_FACTORIES,
    settingsStore: opts.settingsStore,
  })
  registry.hydrate()
  opts.unifiedRegistry.register(VERTICAL, asVerticalRegistry(registry))
  return registry
}

export interface CreateEcommercePluginOptions {
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

export function createEcommercePlugin(opts: CreateEcommercePluginOptions): FastifyPluginAsync {
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
    await app.register(createCollectionsRouter())
    await app.register(createCustomersRouter())
    await app.register(createDiscountsRouter())
    await app.register(createFulfillmentsRouter())
    await app.register(createInventoryRouter())
    await app.register(createLocationsRouter())
    await app.register(createOrdersRouter())
    await app.register(createProductsRouter())
    await app.register(createRefundsRouter())
    await app.register(createTransactionsRouter())
    await app.register(createVariantsRouter())

    if (opts.mode !== 'passthrough' && opts.syncStore) {
      await app.register(createSyncRouter({ vertical: VERTICAL, syncStore: opts.syncStore }))
    }
  }
}

export type { EcommerceAdapter }
