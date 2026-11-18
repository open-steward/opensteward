/**
 * Payments vertical wired into the unified service.
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
import type { PaymentsAdapter } from './adapter/interface'
import { createCustomersRouter } from './router/customers'
import { createPaymentMethodsRouter } from './router/payment-methods'
import { createChargesRouter } from './router/charges'
import { createRefundsRouter } from './router/refunds'
import { createSubscriptionsRouter } from './router/subscriptions'
import { createInvoicesRouter } from './router/invoices'
import { createPayoutsRouter } from './router/payouts'
import { createDisputesRouter } from './router/disputes'
import { createPlansRouter } from './router/plans'
import { createBalanceTransactionsRouter } from './router/balance-transactions'

export const VERTICAL = 'payments'

export function buildPaymentsRegistry(opts: {
  unifiedRegistry: UnifiedAdapterRegistry
  settingsStore: AdapterSettingsStore
}): AdapterRegistry<PaymentsAdapter> {
  const registry = new AdapterRegistry<PaymentsAdapter>({
    vertical: VERTICAL,
    factories: ADAPTER_FACTORIES,
    settingsStore: opts.settingsStore,
  })
  registry.hydrate()
  opts.unifiedRegistry.register(VERTICAL, asVerticalRegistry(registry))
  return registry
}

export interface CreatePaymentsPluginOptions {
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

export function createPaymentsPlugin(opts: CreatePaymentsPluginOptions): FastifyPluginAsync {
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
    await app.register(createCustomersRouter())
    await app.register(createPaymentMethodsRouter())
    await app.register(createChargesRouter())
    await app.register(createRefundsRouter())
    await app.register(createSubscriptionsRouter())
    await app.register(createInvoicesRouter())
    await app.register(createPayoutsRouter())
    await app.register(createDisputesRouter())
    await app.register(createPlansRouter())
    await app.register(createBalanceTransactionsRouter())

    if (opts.mode !== 'passthrough' && opts.syncStore) {
      await app.register(createSyncRouter({ vertical: VERTICAL, syncStore: opts.syncStore }))
    }
  }
}

export type { PaymentsAdapter }
