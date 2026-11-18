import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawBoxstormStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/boxstorm/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('boxstorm transformStockTransfer', () => {
  const raw: RawBoxstormStockTransfer = {
    id: 400,
    number: 'TO-1042',
    fromLocationId: 5,
    fromLocationName: 'Main Warehouse',
    toLocationId: 8,
    toLocationName: 'Secondary Warehouse',
    status: 'In Transit',
    dateShipped: '2024-03-01T00:00:00Z',
    dateCompleted: '2024-03-01T00:00:00Z',
    lines: [
      {
        partId: 101,
        partNumber: 'WDG-001',
        quantity: 10,
        quantityReceived: 10,
      },
    ],
  }

  it('maps id and externalId as string from numeric id', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('400')
    expect(result.externalId).toBe('400')
  })

  it('maps number', () => {
    const result = transformStockTransfer(raw)
    expect(result.number).toBe('TO-1042')
  })

  it('maps fromLocationId from numeric fromLocationId', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('5')
  })

  it('falls back to fromLocationName when fromLocationId absent', () => {
    const result = transformStockTransfer({ ...raw, fromLocationId: undefined })
    expect(result.fromLocationId).toBe('Main Warehouse')
  })

  it('maps toLocationId from numeric toLocationId', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('8')
  })

  it('maps In Transit status to in_transit', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps Draft status to draft', () => {
    const result = transformStockTransfer({ ...raw, status: 'Draft' })
    expect(result.status).toBe('draft')
  })

  it('maps Completed status to completed', () => {
    const result = transformStockTransfer({ ...raw, status: 'Completed' })
    expect(result.status).toBe('completed')
  })

  it('maps Voided status to cancelled', () => {
    const result = transformStockTransfer({ ...raw, status: 'Voided' })
    expect(result.status).toBe('cancelled')
  })

  it('maps line items', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('101')
    expect(result.lines[0]!.quantity).toBe(10)
    expect(result.lines[0]!.quantityReceived).toBe(10)
  })

  it('maps shippedAt from dateShipped', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from dateCompleted', () => {
    const result = transformStockTransfer(raw)
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to boxstorm', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('boxstorm')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
