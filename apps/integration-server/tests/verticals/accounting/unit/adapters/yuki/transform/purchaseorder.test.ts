import { describe, it, expect } from 'vitest'
import { transformPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/yuki/transform/purchaseorder'

describe('transformPurchaseOrder (yuki)', () => {
  it('throws because purchase orders are not available in the Yuki SOAP API', () => {
    // Yuki SOAP API does not expose purchase orders; this transform is a placeholder.
    expect(() => transformPurchaseOrder({})).toThrow(
      'Yuki: purchase order endpoint is not available in the SOAP API',
    )
  })
})
