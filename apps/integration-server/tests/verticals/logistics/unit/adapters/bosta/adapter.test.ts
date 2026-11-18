/**
 * `getRates` used to POST to an invented `rates` path — metadata.ts already
 * declared `rate` unverified/unavailable, contradicting the method (check:
 * adapter-declarations). Docs checked (see index.ts for detail):
 * docs.bosta.co's own sitemap lists exactly one API reference page
 * (get-delivery), and the official bostaapp/bosta-nodejs SDK only wraps
 * cities, deliveries, pickups and zones. Pins that the method stays gone, so
 * the router answers a real 501 NOT_IMPLEMENTED (router/rates.ts, gated on
 * `!adapter.getRates`) instead of a 500 dressed up as a vendor 404.
 */
import { describe, it, expect } from 'vitest'
import { BostaAdapter } from '../../../../../../src/verticals/logistics/adapters/bosta'
import { metadata } from '../../../../../../src/verticals/logistics/adapters/bosta/metadata'
import type { LogisticsAdapter } from '../../../../../../src/verticals/logistics/adapter/interface'

describe('BostaAdapter — rate', () => {
  it('does not implement getRates', () => {
    // Typed as the interface, not the concrete class: `getRates` is optional
    // on LogisticsAdapter, so this checks the same "method absent" contract
    // router/rates.ts gates on, without a `tsc --noEmit -p tsconfig.test.json`
    // error for referencing a property the concrete class never declares.
    const adapter: LogisticsAdapter = new BostaAdapter()
    expect(adapter.getRates).toBeUndefined()
  })

  it('declares rate unavailable in metadata', () => {
    expect(metadata.availableResources).not.toContain('rate')
    expect(metadata.unavailableResources.map((r) => r.resource)).toContain('rate')
  })
})
