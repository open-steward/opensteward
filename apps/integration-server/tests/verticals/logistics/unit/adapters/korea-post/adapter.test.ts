/**
 * `getRates` used to POST to an invented `rates` path — metadata.ts already
 * declared `rate` unverified/unavailable, contradicting the method (check:
 * adapter-declarations). Docs checked (see index.ts for detail): the
 * biz.epost.go.kr contract-customer portal named in constants.ts renders a
 * client-side shell with no publicly reachable API reference, and no
 * official or community SDK for it turned up on GitHub. Pins that the
 * method stays gone, so the router answers a real 501 NOT_IMPLEMENTED
 * (router/rates.ts, gated on `!adapter.getRates`) instead of a 500 dressed
 * up as a vendor 404. transform/rate.ts is kept (see its own test) in case a
 * captured live response later confirms the endpoint.
 */
import { describe, it, expect } from 'vitest'
import { KoreaPostAdapter } from '../../../../../../src/verticals/logistics/adapters/korea-post'
import { metadata } from '../../../../../../src/verticals/logistics/adapters/korea-post/metadata'
import type { LogisticsAdapter } from '../../../../../../src/verticals/logistics/adapter/interface'

describe('KoreaPostAdapter — rate', () => {
  it('does not implement getRates', () => {
    // Typed as the interface, not the concrete class: `getRates` is optional
    // on LogisticsAdapter, so this checks the same "method absent" contract
    // router/rates.ts gates on, without a `tsc --noEmit -p tsconfig.test.json`
    // error for referencing a property the concrete class never declares.
    const adapter: LogisticsAdapter = new KoreaPostAdapter()
    expect(adapter.getRates).toBeUndefined()
  })

  it('declares rate unavailable in metadata', () => {
    expect(metadata.availableResources).not.toContain('rate')
    expect(metadata.unavailableResources.map((r) => r.resource)).toContain('rate')
  })
})
