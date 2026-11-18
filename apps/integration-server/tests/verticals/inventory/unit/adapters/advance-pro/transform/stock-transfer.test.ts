import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawAdvanceProStockTransfer,
  type RawAdvanceProTransferLine,
} from '../../../../../../../src/verticals/inventory/adapters/advance-pro/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

const rawLine: RawAdvanceProTransferLine = {
  productId: '42',
  quantity: 25,
  received: 20,
}

const rawTransfer: RawAdvanceProStockTransfer = {
  id: '3',
  number: 'TR-001',
  fromWarehouseId: '5',
  toWarehouseId: '8',
  status: 'SHIPPED',
  shipDate: '2024-03-01T00:00:00Z',
  lines: [rawLine],
}

describe('transformStockTransfer', () => {
  it('maps id, fromLocationId, and toLocationId', () => {
    const result = transformStockTransfer(rawTransfer)
    expect(result.id).toBe('3')
    expect(result.fromLocationId).toBe('5')
    expect(result.toLocationId).toBe('8')
  })

  it('maps SHIPPED status to in_transit', () => {
    const result = transformStockTransfer(rawTransfer)
    expect(result.status).toBe('in_transit')
  })

  it('maps line quantity and quantityReceived', () => {
    const result = transformStockTransfer(rawTransfer)
    expect(result.lines[0]?.quantity).toBe(25)
    expect(result.lines[0]?.quantityReceived).toBe(20)
  })

  it('maps platform and number', () => {
    const result = transformStockTransfer(rawTransfer)
    expect(result.platform).toBe('advance-pro')
    expect(result.number).toBe('TR-001')
  })

  it('passes StockTransferSchema validation', () => {
    const result = transformStockTransfer(rawTransfer)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
