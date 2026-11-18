import { describe, it, expect } from 'vitest'
import { transformStockAdjustment } from '../../../../../../../src/verticals/inventory/adapters/acctivate/transform/stock-adjustment'

describe('transformStockAdjustment', () => {
  it('throws with the expected message', () => {
    expect(() => transformStockAdjustment({})).toThrow(
      'acctivate: stock adjustments are not available via the web-service API',
    )
  })
})
