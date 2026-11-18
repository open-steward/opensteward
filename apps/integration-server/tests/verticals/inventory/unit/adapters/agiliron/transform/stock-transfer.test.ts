import { describe, it, expect } from 'vitest'
import { transformStockTransfer } from '../../../../../../../src/verticals/inventory/adapters/agiliron/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('transformStockTransfer', () => {
  const raw = {
    OrdersId: 'TR-001',
    OrderNo: 'TR-001',
    Status: 'SHIPPED',
    DeliverFrom: 'Warehouse A',
    DeliverTo: 'Warehouse B',
    OrderDate: '2024-03-01T00:00:00Z',
    OrderDetails: [{ ProductCode: 'WK-2026', ProductQty: 25 }],
  }

  it('maps id, fromLocationId, and toLocationId', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('TR-001')
    expect(result.fromLocationId).toBe('Warehouse A')
    expect(result.toLocationId).toBe('Warehouse B')
    expect(result.platform).toBe('agiliron')
  })

  it('maps SHIPPED status to in_transit', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps order detail lines', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines[0]?.productId).toBe('WK-2026')
    expect(result.lines[0]?.quantity).toBe(25)
  })

  it('maps COMPLETED status to completed', () => {
    const result = transformStockTransfer({ ...raw, Status: 'COMPLETED' })
    expect(result.status).toBe('completed')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
