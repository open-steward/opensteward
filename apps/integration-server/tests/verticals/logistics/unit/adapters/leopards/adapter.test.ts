/**
 * `getRates` used to POST to an invented `rates` path — metadata.ts already
 * declared `rate` unverified/unavailable, contradicting the method (check:
 * adapter-declarations). Docs checked (see index.ts for detail): the
 * developifynet/leopardscod-php community wrapper, which targets the same
 * merchantapistaging.leopardscourier.com base this adapter uses, only calls
 * getAllCities/bookPacket/trackBookedPacket. Pins that the method stays
 * gone, so the router answers a real 501 NOT_IMPLEMENTED (router/rates.ts,
 * gated on `!adapter.getRates`) instead of a 500 dressed up as a vendor 404.
 */
import { describe, it, expect } from 'vitest'
import { LeopardsAdapter } from '../../../../../../src/verticals/logistics/adapters/leopards'
import { metadata } from '../../../../../../src/verticals/logistics/adapters/leopards/metadata'
import type { LogisticsAdapter } from '../../../../../../src/verticals/logistics/adapter/interface'

describe('LeopardsAdapter — rate', () => {
  it('does not implement getRates', () => {
    // Typed as the interface, not the concrete class: `getRates` is optional
    // on LogisticsAdapter, so this checks the same "method absent" contract
    // router/rates.ts gates on, without a `tsc --noEmit -p tsconfig.test.json`
    // error for referencing a property the concrete class never declares.
    const adapter: LogisticsAdapter = new LeopardsAdapter()
    expect(adapter.getRates).toBeUndefined()
  })

  it('declares rate unavailable in metadata', () => {
    expect(metadata.availableResources).not.toContain('rate')
    expect(metadata.unavailableResources.map((r) => r.resource)).toContain('rate')
  })
})
