import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawUnicommerceInventoryAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/unicommerce/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

function makeRaw(
  overrides: Partial<RawUnicommerceInventoryAdjustment> = {},
): RawUnicommerceInventoryAdjustment {
  return {
    id: 'SKU-001:WH-DELHI:2024-03-01T00:00:00Z',
    facilityCode: 'WH-DELHI',
    itemSKU: 'SKU-001',
    quantity: 10,
    adjustmentType: 'ADD',
    inventoryType: 'GOOD',
    shelfCode: 'SHELF-A1',
    remarks: 'correction entry',
    adjustedAt: '2024-03-01T00:00:00Z',
    adjustedBy: 'user@example.com',
    ...overrides,
  }
}

describe('transformStockAdjustment (unicommerce)', () => {
  it('maps id and externalId from provided id', () => {
    const result = transformStockAdjustment(
      makeRaw({ id: 'SKU-001:WH-DELHI:2024-03-01T00:00:00Z' }),
    )
    expect(result.id).toBe('SKU-001:WH-DELHI:2024-03-01T00:00:00Z')
    expect(result.externalId).toBe('SKU-001:WH-DELHI:2024-03-01T00:00:00Z')
  })

  it('constructs synthetic id from sku:facility:adjustedAt when id is absent', () => {
    const result = transformStockAdjustment(
      makeRaw({
        id: undefined,
        itemSKU: 'SKU-001',
        facilityCode: 'WH-DELHI',
        adjustedAt: '2024-03-01T00:00:00Z',
      }),
    )
    expect(result.id).toBe('SKU-001:WH-DELHI:2024-03-01T00:00:00Z')
  })

  it('maps locationId from facilityCode', () => {
    const result = transformStockAdjustment(makeRaw({ facilityCode: 'WH-DELHI' }))
    expect(result.locationId).toBe('WH-DELHI')
  })

  it('ADD adjustmentType produces positive deltaQuantity', () => {
    const result = transformStockAdjustment(makeRaw({ adjustmentType: 'ADD', quantity: 10 }))
    expect(result.lines[0]!.deltaQuantity).toBe(10)
  })

  it('REMOVE adjustmentType produces negative deltaQuantity', () => {
    const result = transformStockAdjustment(makeRaw({ adjustmentType: 'REMOVE', quantity: 10 }))
    expect(result.lines[0]!.deltaQuantity).toBe(-10)
  })

  it('always produces exactly one line item (single-SKU API)', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('SKU-001')
  })

  it('maps adjustedAt from ISO string', () => {
    const result = transformStockAdjustment(makeRaw({ adjustedAt: '2024-03-01T00:00:00Z' }))
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('defaults adjustedAt to current time when absent', () => {
    const before = Date.now()
    const result = transformStockAdjustment(makeRaw({ id: 'test-id', adjustedAt: undefined }))
    const after = Date.now()
    const ts = new Date(result.adjustedAt).getTime()
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })

  it('maps adjustedBy', () => {
    const result = transformStockAdjustment(makeRaw({ adjustedBy: 'user@example.com' }))
    expect(result.adjustedBy).toBe('user@example.com')
  })

  describe('reason mapping', () => {
    it.each([
      [{ remarks: 'cycle count adjustment' }, 'cycle_count'],
      [{ remarks: 'damaged goods' }, 'damage'],
      [{ remarks: undefined, inventoryType: 'DAMAGE' }, 'damage'],
      [{ remarks: 'theft incident' }, 'theft'],
      [{ remarks: 'lost in transit' }, 'lost'],
      [{ remarks: 'found in back shelf' }, 'found'],
      [{ remarks: undefined, inventoryType: 'FOUND' }, 'found'],
      [{ remarks: 'expiry removal' }, 'expiration'],
      [{ remarks: 'correction entry' }, 'correction'],
      [{ remarks: 'miscellaneous', inventoryType: 'GOOD' }, 'other'],
    ] as const)('maps remarks/inventoryType to reason correctly', (fields, expected) => {
      const raw = makeRaw({
        remarks: fields.remarks ?? undefined,
        inventoryType: (fields as any).inventoryType ?? 'GOOD',
      })
      expect(transformStockAdjustment(raw).reason).toBe(expected)
    })
  })

  it('platform is "unicommerce"', () => {
    expect(transformStockAdjustment(makeRaw()).platform).toBe('unicommerce')
  })

  it('passes StockAdjustmentSchema validation', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
