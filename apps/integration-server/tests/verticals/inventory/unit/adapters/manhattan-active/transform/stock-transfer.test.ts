import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawManhattanActiveTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/manhattan-active/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('manhattan-active transformStockTransfer', () => {
  const raw: RawManhattanActiveTransfer = {
    transferId: 'XFER-001',
    transferNumber: 'MAN-XFER-2024-001',
    fromLocationId: 'LOC-SRC',
    fromLocationName: 'Zone A',
    toLocationId: 'LOC-DST',
    toLocationName: 'Zone B',
    status: 'IN_TRANSIT',
    lines: [
      {
        itemId: 'ITEM-001',
        quantity: 10,
        quantityReceived: 0,
      },
    ],
    shipDateTime: '2024-03-01T00:00:00Z',
    completedDateTime: undefined,
  }

  it('maps id and externalId from transferId', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('XFER-001')
    expect(result.externalId).toBe('XFER-001')
  })

  it('maps number from transferNumber', () => {
    const result = transformStockTransfer(raw)
    expect(result.number).toBe('MAN-XFER-2024-001')
  })

  it('maps fromLocationId from fromLocationId', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('LOC-SRC')
  })

  it('maps toLocationId from toLocationId', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('LOC-DST')
  })

  it('maps IN_TRANSIT status to in_transit', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps DRAFT status to draft', () => {
    const result = transformStockTransfer({ ...raw, status: 'DRAFT' })
    expect(result.status).toBe('draft')
  })

  it('maps COMPLETED status to completed', () => {
    const result = transformStockTransfer({ ...raw, status: 'COMPLETED' })
    expect(result.status).toBe('completed')
  })

  it('maps CANCELLED status to cancelled', () => {
    const result = transformStockTransfer({ ...raw, status: 'CANCELLED' })
    expect(result.status).toBe('cancelled')
  })

  it('maps lines from lines array', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('ITEM-001')
    expect(result.lines[0].quantity).toBe(10)
    expect(result.lines[0].quantityReceived).toBe(0)
  })

  it('maps shippedAt from shipDateTime', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to manhattan-active', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('manhattan-active')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    expect(() => StockTransferSchema.parse(transformStockTransfer(raw))).not.toThrow()
  })
})
