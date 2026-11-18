import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawMrpeasyStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/mrpeasy/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('mrpeasy transformStockTransfer', () => {
  // MRPeasy dates are Unix timestamps; 1709251200 = 2024-03-01T00:00:00Z
  const raw: RawMrpeasyStockTransfer = {
    transfer_id: 700,
    code: 'TRF-2024-001',
    from_site_id: 3,
    to_site_id: 5,
    status: 10,
    ship_date: 1709251200,
    items: [
      {
        article_id: 100,
        quantity: 10,
        received: 0,
      },
    ],
  }

  it('maps id and externalId from transfer_id as string', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('700')
    expect(result.externalId).toBe('700')
  })

  it('maps number from code field', () => {
    const result = transformStockTransfer(raw)
    expect(result.number).toBe('TRF-2024-001')
  })

  it('maps fromLocationId from from_site_id as string', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('3')
  })

  it('maps toLocationId from to_site_id as string', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('5')
  })

  it('maps status code 10 to in_transit', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps status code 5 to draft', () => {
    const result = transformStockTransfer({ ...raw, status: 5 })
    expect(result.status).toBe('draft')
  })

  it('maps status code 20 to completed', () => {
    const result = transformStockTransfer({ ...raw, status: 20 })
    expect(result.status).toBe('completed')
  })

  it('maps status code 30 to cancelled', () => {
    const result = transformStockTransfer({ ...raw, status: 30 })
    expect(result.status).toBe('cancelled')
  })

  it('maps line productId from article_id', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines[0]?.productId).toBe('100')
  })

  it('maps line quantity', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines[0]?.quantity).toBe(10)
  })

  it('converts unix timestamp ship_date to ISO string', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to mrpeasy', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('mrpeasy')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
