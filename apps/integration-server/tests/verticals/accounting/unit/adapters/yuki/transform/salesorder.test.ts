import { describe, it, expect } from 'vitest'
import { transformSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/yuki/transform/salesorder'

describe('transformSalesOrder (yuki)', () => {
  it('throws because sales orders are not available in the Yuki SOAP API', () => {
    // Yuki SOAP API does not expose sales orders; this transform is a placeholder.
    expect(() => transformSalesOrder({})).toThrow(
      'Yuki: sales order endpoint is not available in the SOAP API',
    )
  })
})
