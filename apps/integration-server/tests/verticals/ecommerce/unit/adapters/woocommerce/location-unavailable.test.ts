/**
 * WooCommerce core v3 REST API has no stock/fulfillment location resource —
 * the adapter used to paper over that with a synthetic "default" location
 * (`listLocations`/`getLocation` returning `syntheticDefaultLocation()`) while
 * `metadata.ts` declared `location` available. That is a CONTRADICTION under
 * `scripts/check-adapter-declarations.ts`: a resource declared unavailable
 * must have no adapter method, and vice versa (classifyAdapter). Pin both
 * sides together so neither can drift back on its own.
 */
import { describe, it, expect } from 'vitest'
import { WooCommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapters/woocommerce/index'
import { metadata } from '../../../../../../src/verticals/ecommerce/adapters/woocommerce/metadata'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'

describe('WooCommerce location declaration', () => {
  it('declares location unavailable, not available', () => {
    expect(metadata.availableResources).not.toContain('location')
    const entry = metadata.unavailableResources.find((r) => r.resource === 'location')
    expect(entry).toBeDefined()
    expect(entry?.reason).toMatch(/no stock or fulfillment location resource/i)
  })

  it('implements no listLocations/getLocation method — the synthetic default location is gone', () => {
    // Typed via the interface, not the concrete class: WooCommerceAdapter no
    // longer declares listLocations/getLocation at all, so accessing them on
    // the concrete class type would be a compile error rather than a runtime
    // `undefined` check. Typed as `EcommerceAdapter`, both are
    // declared-optional methods and the access type-checks as `(...) => ... |
    // undefined`, matching the runtime check.
    const adapter: EcommerceAdapter = new WooCommerceAdapter({
      consumerKey: 'ck_test',
      consumerSecret: 'cs_test',
      site: 'https://shop.example.com',
    })
    expect(adapter.listLocations).toBeUndefined()
    expect(adapter.getLocation).toBeUndefined()
  })
})
