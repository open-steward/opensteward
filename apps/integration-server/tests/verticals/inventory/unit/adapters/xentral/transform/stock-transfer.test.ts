import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawXentralStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/xentral/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

const rawTransfer: RawXentralStockTransfer = {
  id: 55,
  number: 'UML-2024-055',
  fromWarehouseId: 1,
  toWarehouseId: 2,
  status: 'in_transit',
  shippedAt: '2024-03-01T00:00:00Z',
  receivedAt: '2024-03-05T00:00:00Z',
  lines: [
    { productId: 99, quantity: 30, quantityReceived: 30 },
    { productId: 100, quantity: 10 },
  ],
}

describe('xentral transformStockTransfer', () => {
  it('converts numeric id to string id', () => {
    const result = transformStockTransfer(rawTransfer)
    expect(result.id).toBe('55')
    expect(result.externalId).toBe('55')
  })

  it('maps number to number', () => {
    const result = transformStockTransfer(rawTransfer)
    expect(result.number).toBe('UML-2024-055')
  })

  it('maps fromWarehouseId to fromLocationId as string', () => {
    const result = transformStockTransfer(rawTransfer)
    expect(result.fromLocationId).toBe('1')
  })

  it('maps toWarehouseId to toLocationId as string', () => {
    const result = transformStockTransfer(rawTransfer)
    expect(result.toLocationId).toBe('2')
  })

  it('maps "in_transit" status to "in_transit"', () => {
    const result = transformStockTransfer(rawTransfer)
    expect(result.status).toBe('in_transit')
  })

  it('maps lines with productId and quantities', () => {
    const result = transformStockTransfer(rawTransfer)
    expect(result.lines).toHaveLength(2)
    expect(result.lines[0]!.productId).toBe('99')
    expect(result.lines[0]!.quantity).toBe(30)
    expect(result.lines[0]!.quantityReceived).toBe(30)
  })

  it('maps shippedAt and receivedAt', () => {
    const result = transformStockTransfer(rawTransfer)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.receivedAt).toBe('2024-03-05T00:00:00.000Z')
  })

  it('sets platform=xentral', () => {
    const result = transformStockTransfer(rawTransfer)
    expect(result.platform).toBe('xentral')
  })

  it('produces a schema-valid StockTransfer', () => {
    const result = transformStockTransfer(rawTransfer)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })

  it('maps "versandt" status to "in_transit"', () => {
    const result = transformStockTransfer({ ...rawTransfer, status: 'versandt' })
    expect(result.status).toBe('in_transit')
  })

  it('maps "abgeschlossen" status to "completed"', () => {
    const result = transformStockTransfer({ ...rawTransfer, status: 'abgeschlossen' })
    expect(result.status).toBe('completed')
  })

  it('defaults fromLocationId to empty string when fromWarehouseId is null', () => {
    const result = transformStockTransfer({ ...rawTransfer, fromWarehouseId: undefined })
    expect(result.fromLocationId).toBe('')
  })
})
