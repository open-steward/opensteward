import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawCrunchtimeStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/crunchtime/transform/stock-transfer'

describe('crunchtime transformStockTransfer', () => {
  it('throws because the stock-transfer endpoint is not available in the public API', () => {
    const raw: RawCrunchtimeStockTransfer = {}
    expect(() => transformStockTransfer(raw)).toThrow(
      'crunchtime: stock-transfer endpoint not available in public API',
    )
  })
})
