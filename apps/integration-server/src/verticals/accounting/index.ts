/**
 * Accounting vertical wired into the unified service.
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
import type { AccountingAdapter } from './adapter/interface'
import { createOrganizationsRouter } from './router/organizations'
import { createInvoicesRouter } from './router/invoices'
import { createBillsRouter } from './router/bills'
import { createContactsRouter } from './router/contacts'
import { createAccountsRouter } from './router/accounts'
import { createJournalsRouter } from './router/journals'
import { createTransactionsRouter } from './router/transactions'
import { createTaxratesRouter } from './router/taxrates'
import { createExpensesRouter } from './router/expenses'
import { createCreditmemosRouter } from './router/creditmemos'
import { createQuotesRouter } from './router/quotes'
import { createOrdersRouter } from './router/orders'
import { createSalesordersRouter } from './router/salesorders'
import { createPurchaseordersRouter } from './router/purchaseorders'

export const VERTICAL = 'accounting'

export function buildAccountingRegistry(opts: {
  unifiedRegistry: UnifiedAdapterRegistry
  settingsStore: AdapterSettingsStore
}): AdapterRegistry<AccountingAdapter> {
  const registry = new AdapterRegistry<AccountingAdapter>({
    vertical: VERTICAL,
    factories: ADAPTER_FACTORIES,
    settingsStore: opts.settingsStore,
  })
  registry.hydrate()
  opts.unifiedRegistry.register(VERTICAL, asVerticalRegistry(registry))
  return registry
}

export interface CreateAccountingPluginOptions {
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

export function createAccountingPlugin(opts: CreateAccountingPluginOptions): FastifyPluginAsync {
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
    await app.register(createOrganizationsRouter(), { prefix: '/organizations' })
    await app.register(createInvoicesRouter(), { prefix: '/invoices' })
    await app.register(createBillsRouter(), { prefix: '/bills' })
    await app.register(createContactsRouter(), { prefix: '/contacts' })
    await app.register(createAccountsRouter(), { prefix: '/accounts' })
    await app.register(createJournalsRouter(), { prefix: '/journals' })
    await app.register(createTransactionsRouter(), { prefix: '/transactions' })
    await app.register(createTaxratesRouter(), { prefix: '/taxrates' })
    await app.register(createExpensesRouter(), { prefix: '/expenses' })
    await app.register(createCreditmemosRouter(), { prefix: '/creditmemos' })
    await app.register(createQuotesRouter(), { prefix: '/quotes' })
    await app.register(createOrdersRouter(), { prefix: '/orders' })
    await app.register(createSalesordersRouter(), { prefix: '/salesorders' })
    await app.register(createPurchaseordersRouter(), { prefix: '/purchaseorders' })

    if (opts.mode !== 'passthrough' && opts.syncStore) {
      await app.register(createSyncRouter({ vertical: VERTICAL, syncStore: opts.syncStore }))
    }
  }
}

export type { AccountingAdapter }
