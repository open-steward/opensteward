import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawDaVinciUnifiedStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/da-vinci-unified/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('da-vinci-unified transformStockTransfer', () => {
  const raw: RawDaVinciUnifiedStockTransfer = {
    transferId: 'tr-001',
    transferNumber: 'TR-1001',
    fromWarehouseId: 'wh-001',
    toWarehouseId: 'wh-002',
    status: 'IN TRANSIT',
    lines: [{ itemId: 'item-001', quantity: 50, quantityReceived: 0 }],
    shipDate: '2024-03-01T00:00:00Z',
    completedDate: '2024-03-05T00:00:00Z',
  }

  it('maps id and externalId from transferId', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('tr-001')
    expect(result.externalId).toBe('tr-001')
  })

  it('maps number from transferNumber', () => {
    const result = transformStockTransfer(raw)
    expect(result.number).toBe('TR-1001')
  })

  it('maps fromLocationId and toLocationId', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('wh-001')
    expect(result.toLocationId).toBe('wh-002')
  })

  it('maps status IN TRANSIT to in_transit', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps status COMPLETED to completed', () => {
    const result = transformStockTransfer({ ...raw, status: 'COMPLETED' })
    expect(result.status).toBe('completed')
  })

  it('maps status DRAFT to draft', () => {
    const result = transformStockTransfer({ ...raw, status: 'DRAFT' })
    expect(result.status).toBe('draft')
  })

  it('maps status VOIDED to cancelled', () => {
    const result = transformStockTransfer({ ...raw, status: 'VOIDED' })
    expect(result.status).toBe('cancelled')
  })

  it('maps lines correctly', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('item-001')
    expect(result.lines[0].quantity).toBe(50)
  })

  it('maps shippedAt from shipDate', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from completedDate', () => {
    const result = transformStockTransfer(raw)
    expect(result.receivedAt).toBe('2024-03-05T00:00:00.000Z')
  })

  it('sets platform to da-vinci-unified', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('da-vinci-unified')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
