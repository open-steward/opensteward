import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawKladanaStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/kladana/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

const BASE_HREF = 'https://api.kladana.in/api/remap/1.2/entity'

describe('kladana transformStockTransfer', () => {
  const raw: RawKladanaStockTransfer = {
    id: 'move-uuid-001',
    name: 'ПМ-001',
    sourceStore: {
      meta: { href: `${BASE_HREF}/store/store-uuid-001` },
    },
    targetStore: {
      meta: { href: `${BASE_HREF}/store/store-uuid-002` },
    },
    applicable: true,
    moment: '2024-03-01T00:00:00Z',
    positions: {
      rows: [
        {
          assortment: {
            meta: { href: `${BASE_HREF}/product/prod-uuid-001` },
          },
          quantity: 20,
        },
      ],
    },
  }

  it('maps id from raw.id', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('move-uuid-001')
    expect(result.externalId).toBe('move-uuid-001')
  })

  it('maps number from name', () => {
    const result = transformStockTransfer(raw)
    expect(result.number).toBe('ПМ-001')
  })

  it('extracts fromLocationId from sourceStore meta href', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('store-uuid-001')
  })

  it('extracts toLocationId from targetStore meta href', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('store-uuid-002')
  })

  it('maps applicable=true to status completed', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('completed')
  })

  it('maps applicable=false to status draft', () => {
    const result = transformStockTransfer({ ...raw, applicable: false })
    expect(result.status).toBe('draft')
  })

  it('maps line items', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('prod-uuid-001')
    expect(result.lines[0].quantity).toBe(20)
  })

  it('maps shippedAt from moment', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('has no receivedAt (not available in Kladana)', () => {
    const result = transformStockTransfer(raw)
    expect(result.receivedAt).toBeUndefined()
  })

  it('sets platform to kladana', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('kladana')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    expect(() => StockTransferSchema.parse(transformStockTransfer(raw))).not.toThrow()
  })
})
