import { describe, it, expect } from 'vitest'
import { transformOrder } from '../../../../../../../src/verticals/accounting/adapters/yuki/transform/order'

describe('transformOrder (yuki)', () => {
  it('throws because orders are not available in the Yuki SOAP API', () => {
    // Yuki SOAP API does not expose orders; this transform is a placeholder.
    expect(() => transformOrder({})).toThrow(
      'Yuki: order endpoint is not available in the SOAP API',
    )
  })
})
