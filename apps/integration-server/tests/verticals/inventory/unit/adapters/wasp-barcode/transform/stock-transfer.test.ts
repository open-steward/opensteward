import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawWaspBarcodeStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/wasp-barcode/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

const rawTransfer: RawWaspBarcodeStockTransfer = {
  TransactionId: 'MOV-555',
  ItemNumber: 'ITEM-001',
  FromLocationCode: 'A-01',
  FromSiteName: 'MAIN',
  ToLocationCode: 'B-02',
  ToSiteName: 'SECONDARY',
  Quantity: 20,
  TransactionDate: '2024-03-01T00:00:00Z',
  UserName: 'jdoe',
}

describe('wasp-barcode transformStockTransfer', () => {
  it('maps TransactionId to id', () => {
    const result = transformStockTransfer(rawTransfer)
    expect(result.id).toBe('MOV-555')
    expect(result.externalId).toBe('MOV-555')
  })

  it('maps FromLocationCode to fromLocationId', () => {
    const result = transformStockTransfer(rawTransfer)
    expect(result.fromLocationId).toBe('A-01')
  })

  it('maps ToLocationCode to toLocationId', () => {
    const result = transformStockTransfer(rawTransfer)
    expect(result.toLocationId).toBe('B-02')
  })

  it('sets status=completed for atomic move transactions', () => {
    const result = transformStockTransfer(rawTransfer)
    expect(result.status).toBe('completed')
  })

  it('creates one line with productId and quantity', () => {
    const result = transformStockTransfer(rawTransfer)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('ITEM-001')
    expect(result.lines[0]!.quantity).toBe(20)
    expect(result.lines[0]!.quantityReceived).toBe(20)
  })

  it('maps TransactionDate to shippedAt and receivedAt', () => {
    const result = transformStockTransfer(rawTransfer)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform=wasp-barcode', () => {
    const result = transformStockTransfer(rawTransfer)
    expect(result.platform).toBe('wasp-barcode')
  })

  it('produces a schema-valid StockTransfer', () => {
    const result = transformStockTransfer(rawTransfer)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })

  it('falls back to FromSiteName when FromLocationCode absent', () => {
    const result = transformStockTransfer({ ...rawTransfer, FromLocationCode: undefined })
    expect(result.fromLocationId).toBe('MAIN')
  })
})
