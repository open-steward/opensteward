import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawDeposcoTransferOrder,
} from '../../../../../../../src/verticals/inventory/adapters/deposco/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('deposco transformStockTransfer', () => {
  const raw: RawDeposcoTransferOrder = {
    orderNumber: 'DEP-TR-001',
    fromFacilityNumber: 'FAC-001',
    toFacilityNumber: 'FAC-002',
    status: 'IN TRANSIT',
    lines: [{ itemNumber: 'DEP-SKU-001', quantity: 30, quantityReceived: 0 }],
    shipDate: '2024-03-01T00:00:00Z',
    completedDate: '2024-03-05T00:00:00Z',
  }

  it('maps id, externalId, and number from orderNumber', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('DEP-TR-001')
    expect(result.externalId).toBe('DEP-TR-001')
    expect(result.number).toBe('DEP-TR-001')
  })

  it('maps fromLocationId from fromFacilityNumber', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('FAC-001')
  })

  it('maps toLocationId from toFacilityNumber', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('FAC-002')
  })

  it('maps status "IN TRANSIT" to in_transit', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps status OPEN to draft', () => {
    const result = transformStockTransfer({ ...raw, status: 'OPEN' })
    expect(result.status).toBe('draft')
  })

  it('maps status RECEIVED to completed', () => {
    const result = transformStockTransfer({ ...raw, status: 'RECEIVED' })
    expect(result.status).toBe('completed')
  })

  it('maps status CLOSED to completed', () => {
    const result = transformStockTransfer({ ...raw, status: 'CLOSED' })
    expect(result.status).toBe('completed')
  })

  it('maps status CANCELLED to cancelled', () => {
    const result = transformStockTransfer({ ...raw, status: 'CANCELLED' })
    expect(result.status).toBe('cancelled')
  })

  it('maps lines correctly', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('DEP-SKU-001')
    expect(result.lines[0].quantity).toBe(30)
    expect(result.lines[0].quantityReceived).toBe(0)
  })

  it('maps shippedAt from shipDate', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from completedDate', () => {
    const result = transformStockTransfer(raw)
    expect(result.receivedAt).toBe('2024-03-05T00:00:00.000Z')
  })

  it('sets platform to deposco', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('deposco')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
