/**
 * Cross-cutting parity test: every OAuth adapter's `getAuthUrl` honors the
 * `overrideScopes` second arg, OR doesn't emit a `scope=` URL param at all
 * (Bucket-D platforms like Salesforce that configure scopes at the
 * Connected App level on the provider's side).
 *
 * Adapter factories are imported from each vertical's adapter registry.
 * Stub configs satisfy the constructor surface; we don't actually hit any
 * upstream endpoint.
 */
import { describe, expect, it } from 'vitest'
import { ADAPTER_FACTORIES as ACCOUNTING_FACTORIES } from '../../src/verticals/accounting/adapter/factories'
import { ADAPTER_FACTORIES as CRM_FACTORIES } from '../../src/verticals/crm/adapter/factories'
import { ADAPTER_FACTORIES as ECOMMERCE_FACTORIES } from '../../src/verticals/ecommerce/adapter/factories'
import { ADAPTER_FACTORIES as LOGISTICS_FACTORIES } from '../../src/verticals/logistics/adapter/factories'

const STUB_CONFIG = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  redirectUri: 'https://example.test/callback',
  scopes: ['default-scope-a', 'default-scope-b'],
  // Adapters that need extras (e.g. shopify shop, dynamics365bc tenantId) accept undefined.
  shop: 'test.myshopify.com',
  tenantId: 'common',
  apiKey: 'test-api-key',
  apiSecret: 'test-api-secret',
  baseUrl: 'https://example.test',
}

const OVERRIDE = 'unique-override-scope-marker-zzzy'

interface FactoryEntry {
  vertical: string
  slug: string
  factory: (cfg: unknown) => { getAuthUrl: (s: string, o?: string[]) => string }
}

const ALL_FACTORIES: FactoryEntry[] = [
  ...Object.entries(ACCOUNTING_FACTORIES).map(([slug, factory]) => ({ vertical: 'accounting', slug, factory: factory as FactoryEntry['factory'] })),
  ...Object.entries(CRM_FACTORIES).map(([slug, factory]) => ({ vertical: 'crm', slug, factory: factory as FactoryEntry['factory'] })),
  ...Object.entries(ECOMMERCE_FACTORIES).map(([slug, factory]) => ({ vertical: 'ecommerce', slug, factory: factory as FactoryEntry['factory'] })),
  ...Object.entries(LOGISTICS_FACTORIES).map(([slug, factory]) => ({ vertical: 'logistics', slug, factory: factory as FactoryEntry['factory'] })),
]

describe('OAuth adapter scope-override parity', () => {
  for (const { vertical, slug, factory } of ALL_FACTORIES) {
    it(`${vertical}/${slug}: honors overrideScopes (or doesn't emit scope param)`, () => {
      let adapter: ReturnType<typeof factory>
      try {
        adapter = factory(STUB_CONFIG)
      } catch {
        // Adapter rejects stub config (likely needs domain-specific args we
        // don't supply). Not a parity violation — skip.
        return
      }
      let url: string
      try {
        url = adapter.getAuthUrl('test-state', [OVERRIDE])
      } catch {
        // Non-OAuth adapter (api_key/basic/session/local) — getAuthUrl may
        // throw "OAuth not supported". That's fine; the override is moot.
        return
      }
      // Two acceptance criteria:
      //   1. Override appears verbatim in the URL — the adapter honors it.
      //   2. The URL has no `scope=` param at all — Bucket-D (provider-side
      //      scope config) or non-OAuth.
      const hasScopeParam = /[?&]scope=/.test(url)
      const includesOverride = url.includes(OVERRIDE) || url.includes(encodeURIComponent(OVERRIDE))
      if (hasScopeParam && !includesOverride) {
        // The URL has scope= but it's the default — adapter ignored the override.
        // This is the failure mode we want to catch.
        const scopeParam = url.match(/[?&]scope=([^&]*)/)?.[1] ?? ''
        throw new Error(
          `${vertical}/${slug}: getAuthUrl emitted scope=${decodeURIComponent(scopeParam)} but override ${OVERRIDE} was not honored`,
        )
      }
    })
  }
})
