import { describe, it, expect } from 'vitest'
import { transformStockTransfer } from '../../../../../../../src/verticals/inventory/adapters/acctivate/transform/stock-transfer'

describe('transformStockTransfer', () => {
  it('throws with the expected message', () => {
    expect(() => transformStockTransfer({})).toThrow(
      'acctivate: stock transfers are not available via the web-service API',
    )
  })
})
