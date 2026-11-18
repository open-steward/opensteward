import { describe, it, expect } from 'vitest'
import { transformPurchaseOrder } from '../../../../../../../src/verticals/inventory/adapters/acctivate/transform/purchase-order'

describe('transformPurchaseOrder', () => {
  it('throws with the expected message', () => {
    expect(() => transformPurchaseOrder({})).toThrow(
      'acctivate: purchase orders are not available via the web-service API',
    )
  })
})
