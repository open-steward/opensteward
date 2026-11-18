/**
 * Docsign vertical wired into the unified service.
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
import type { DocsignAdapter } from './adapter/interface'
import { createEnvelopesRouter } from './router/envelopes'
import { createSignersRouter } from './router/signers'
import { createDocumentsRouter } from './router/documents'
import { createAuditTrailEntriesRouter } from './router/audit-trail-entries'
import { createTemplatesRouter } from './router/templates'

export const VERTICAL = 'docsign'

export function buildDocsignRegistry(opts: {
  unifiedRegistry: UnifiedAdapterRegistry
  settingsStore: AdapterSettingsStore
}): AdapterRegistry<DocsignAdapter> {
  const registry = new AdapterRegistry<DocsignAdapter>({
    vertical: VERTICAL,
    factories: ADAPTER_FACTORIES,
    settingsStore: opts.settingsStore,
  })
  registry.hydrate()
  opts.unifiedRegistry.register(VERTICAL, asVerticalRegistry(registry))
  return registry
}

export interface CreateDocsignPluginOptions {
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

export function createDocsignPlugin(opts: CreateDocsignPluginOptions): FastifyPluginAsync {
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
    await app.register(createEnvelopesRouter())
    await app.register(createSignersRouter())
    await app.register(createDocumentsRouter())
    await app.register(createAuditTrailEntriesRouter())
    await app.register(createTemplatesRouter())

    if (opts.mode !== 'passthrough' && opts.syncStore) {
      await app.register(createSyncRouter({ vertical: VERTICAL, syncStore: opts.syncStore }))
    }
  }
}

export type { DocsignAdapter }
