import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  FAIRE_DEFAULT_LOCATION_ID,
} from '../../../../../../../src/verticals/ecommerce/adapters/faire/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'
import { docVariant } from '../fixtures'

describe('transformInventoryLevel (Faire variant available_quantity)', () => {
  it('maps a variant with available_quantity (spec example 42) to a canonical level', () => {
    const level = InventoryLevelSchema.parse(
      transformInventoryLevel(
        docVariant({ available_quantity: 42, updated_at: '2024-01-20T14:45:00Z' }),
        'p_123',
      ),
    )
    expect(level).toMatchObject({
      id: `p_123:po_123:${FAIRE_DEFAULT_LOCATION_ID}`,
      // the canonical ProductVariant.id, productId:variantId
      variantId: 'p_123:po_123',
      locationId: FAIRE_DEFAULT_LOCATION_ID,
      available: 42,
      updatedAt: '2024-01-20T14:45:00.000Z',
    })
  })

  it('yields no level when the brand has not set inventory (field absent), never a 0', () => {
    expect(transformInventoryLevel(docVariant(), 'p_123')).toBeUndefined()
  })

  it('keeps a real 0', () => {
    expect(transformInventoryLevel(docVariant({ available_quantity: 0 }), 'p_123')?.available).toBe(
      0,
    )
  })

  it('reports an oversold (negative) quantity as 0 available for sale, which the schema requires', () => {
    const level = transformInventoryLevel(docVariant({ available_quantity: -3 }), 'p_123')
    expect(InventoryLevelSchema.parse(level).available).toBe(0)
  })
})
