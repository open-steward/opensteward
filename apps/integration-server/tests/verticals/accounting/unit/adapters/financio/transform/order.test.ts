import { describe, it, expect } from 'vitest'
import { transformOrder } from '../../../../../../../src/verticals/accounting/adapters/financio/transform/order'

describe('transformOrder (financio)', () => {
  it('throws because orders are not supported', () => {
    expect(() => transformOrder({})).toThrow('Orders are not supported by the Financio adapter')
  })
})
