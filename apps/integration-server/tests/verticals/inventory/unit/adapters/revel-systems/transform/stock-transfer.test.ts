import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawRevelInventoryTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/revel-systems/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('revel-systems transformStockTransfer', () => {
  const raw: RawRevelInventoryTransfer = {
    id: 33,
    from_establishment: '/resources/Establishment/5/',
    to_establishment: '/resources/Establishment/6/',
    status: 'In Transit',
    created_date: '2024-03-01T00:00:00Z',
    shipped_date: '2024-03-02T00:00:00Z',
    completed_date: null,
    inventory_transfer_items: [
      {
        id: 1,
        ingredient: '/resources/Ingredient/20/',
        quantity: 10,
        received_quantity: null,
      },
    ],
  }

  it('stringifies numeric id', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('33')
    expect(result.externalId).toBe('33')
  })

  it('extracts fromLocationId and toLocationId from URIs', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('5')
    expect(result.toLocationId).toBe('6')
  })

  it('maps "In Transit" status to in_transit', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps status values', () => {
    expect(transformStockTransfer({ ...raw, status: 'Draft' }).status).toBe('draft')
    expect(transformStockTransfer({ ...raw, status: 'Completed' }).status).toBe('completed')
    expect(transformStockTransfer({ ...raw, status: 'Received' }).status).toBe('completed')
    expect(transformStockTransfer({ ...raw, status: 'Cancelled' }).status).toBe('cancelled')
    expect(transformStockTransfer({ ...raw, status: 'Voided' }).status).toBe('cancelled')
  })

  it('extracts productId from ingredient URI', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines[0]!.productId).toBe('20')
  })

  it('maps quantity in line items', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines[0]!.quantity).toBe(10)
    expect(result.lines[0]!.quantityReceived).toBeUndefined()
  })

  it('maps shippedAt from shipped_date', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-02T00:00:00.000Z')
  })

  it('omits receivedAt when completed_date is null', () => {
    const result = transformStockTransfer(raw)
    expect(result.receivedAt).toBeUndefined()
  })

  it('maps receivedAt from completed_date when present', () => {
    const result = transformStockTransfer({ ...raw, completed_date: '2024-03-05T00:00:00Z' })
    expect(result.receivedAt).toBe('2024-03-05T00:00:00.000Z')
  })

  it('handles integer establishment IDs', () => {
    const result = transformStockTransfer({ ...raw, from_establishment: 5, to_establishment: 6 })
    expect(result.fromLocationId).toBe('5')
    expect(result.toLocationId).toBe('6')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
