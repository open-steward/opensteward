/**
 * `getRates` was a stub that always returned `[]` — a 200 with no rates
 * where the router's 501 NOT_IMPLEMENTED (router/rates.ts, gated on
 * `!adapter.getRates`) is the honest answer, since nShift Delivery REST API
 * has no rate-shopping endpoint of its own. Pins that the method stays gone.
 */
import { describe, it, expect } from 'vitest'
import { NShiftAdapter } from '../../../../../../src/verticals/logistics/adapters/nshift'
import type { LogisticsAdapter } from '../../../../../../src/verticals/logistics/adapter/interface'

describe('NShiftAdapter — rate', () => {
  it('does not implement getRates', () => {
    // Typed as the interface, not the concrete class: `getRates` is optional
    // on LogisticsAdapter, so this checks the same "method absent" contract
    // router/rates.ts gates on, without a `tsc --noEmit -p tsconfig.test.json`
    // error for referencing a property the concrete class never declares.
    const adapter: LogisticsAdapter = new NShiftAdapter()
    expect(adapter.getRates).toBeUndefined()
  })
})
