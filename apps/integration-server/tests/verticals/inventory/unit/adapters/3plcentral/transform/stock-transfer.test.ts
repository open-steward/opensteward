import { describe, it, expect } from 'vitest'
import { transformStockTransfer } from '../../../../../../../src/verticals/inventory/adapters/3plcentral/transform/stock-transfer'

describe('transformStockTransfer', () => {
  it('throws with the expected message', () => {
    expect(() => transformStockTransfer({})).toThrow(
      '3plcentral: stock transfers are not available via the public REST API',
    )
  })

  it('throws an Error instance', () => {
    expect(() => transformStockTransfer({})).toThrow(Error)
  })
})
