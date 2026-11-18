import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawKladanaStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/kladana/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

const BASE_HREF = 'https://api.kladana.in/api/remap/1.2/entity'

describe('kladana transformStockAdjustment', () => {
  const raw: RawKladanaStockAdjustment = {
    id: 'inv-uuid-001',
    name: 'ИВ-001',
    store: {
      meta: { href: `${BASE_HREF}/store/store-uuid-001` },
    },
    applicable: true,
    description: 'cycle count recount',
    moment: '2024-03-01T00:00:00Z',
    positions: {
      rows: [
        {
          assortment: {
            meta: { href: `${BASE_HREF}/product/prod-uuid-001` },
          },
          quantity: 95,
          calculatedQuantity: 100,
          correctionAmount: -5,
        },
      ],
    },
  }

  it('maps id from raw.id', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('inv-uuid-001')
    expect(result.externalId).toBe('inv-uuid-001')
  })

  it('extracts locationId from store meta href', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('store-uuid-001')
  })

  it('maps reason cycle_count from description containing "count"', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason damage from description', () => {
    const result = transformStockAdjustment({ ...raw, description: 'повреждение товара' })
    expect(result.reason).toBe('damage')
  })

  it('maps reason theft from description', () => {
    const result = transformStockAdjustment({ ...raw, description: 'кража на складе' })
    expect(result.reason).toBe('theft')
  })

  it('defaults reason to other for unrecognized description', () => {
    const result = transformStockAdjustment({ ...raw, description: 'прочее' })
    expect(result.reason).toBe('other')
  })

  it('maps line items using correctionAmount as deltaQuantity', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('prod-uuid-001')
    expect(result.lines[0].deltaQuantity).toBe(-5)
    expect(result.lines[0].countedQuantity).toBe(95)
  })

  it('derives deltaQuantity from quantity - calculatedQuantity when correctionAmount missing', () => {
    const result = transformStockAdjustment({
      ...raw,
      positions: {
        rows: [
          {
            assortment: { meta: { href: `${BASE_HREF}/product/prod-uuid-001` } },
            quantity: 95,
            calculatedQuantity: 100,
            correctionAmount: undefined,
          },
        ],
      },
    })
    expect(result.lines[0].deltaQuantity).toBe(-5)
  })

  it('maps adjustedAt from moment', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back to epoch when moment is missing', () => {
    const result = transformStockAdjustment({ ...raw, moment: undefined })
    expect(result.adjustedAt).toBe(new Date(0).toISOString())
  })

  it('sets platform to kladana', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('kladana')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    expect(() => StockAdjustmentSchema.parse(transformStockAdjustment(raw))).not.toThrow()
  })
})
