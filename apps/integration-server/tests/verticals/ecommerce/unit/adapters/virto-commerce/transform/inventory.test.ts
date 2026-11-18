/**
 * Virto Commerce InventoryInfo → canonical InventoryLevel.
 *
 * Field shapes verified against the live demo instance's
 * VirtoCommerce.Inventory/swagger.json `components.schemas.InventoryInfo`
 * (fetched 2026-09-13): fulfillmentCenterId, productId, inStockQuantity,
 * reservedQuantity, preorderQuantity, backorderQuantity, modifiedDate.
 * `InventoryInfo` carries no id of its own scoped to a single
 * product+location pair in the way the canonical schema wants, so one is
 * synthesized as `${productId}:${fulfillmentCenterId}`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawVirtoInventoryInfo,
} from '../../../../../../../src/verticals/ecommerce/adapters/virto-commerce/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeInventory(overrides: Partial<RawVirtoInventoryInfo> = {}): RawVirtoInventoryInfo {
  return {
    productId: 'prod-1',
    fulfillmentCenterId: 'fc-1',
    inStockQuantity: 50,
    reservedQuantity: 8,
    preorderQuantity: 5,
    backorderQuantity: 2,
    modifiedDate: '2026-02-01T14:20:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (virto-commerce)', () => {
  it('synthesizes the composite id from productId + fulfillmentCenterId', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(result.id).toBe('prod-1:fc-1')
    expect(result.variantId).toBe('prod-1')
    expect(result.locationId).toBe('fc-1')
  })

  it('derives available as on-hand minus reserved', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(result.onHand).toBe(50)
    expect(result.committed).toBe(8)
    expect(result.available).toBe(42)
  })

  it('never reports negative available stock', () => {
    const result = transformInventoryLevel(makeInventory({ inStockQuantity: 3, reservedQuantity: 10 }))
    expect(result.available).toBe(0)
  })

  it('sums preorder + backorder quantity into incoming', () => {
    expect(transformInventoryLevel(makeInventory()).incoming).toBe(7)
  })

  it('maps updatedAt from modifiedDate', () => {
    expect(transformInventoryLevel(makeInventory()).updatedAt).toBe('2026-02-01T14:20:00Z')
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeInventory()
    expect(transformInventoryLevel(raw).metadata).toEqual(raw)
  })

  it('satisfies InventoryLevelSchema', () => {
    expect(() => InventoryLevelSchema.parse(transformInventoryLevel(makeInventory()))).not.toThrow()
  })

  it('throws rather than fabricate available stock when inStockQuantity is not reported', () => {
    expect(() =>
      transformInventoryLevel(makeInventory({ inStockQuantity: undefined })),
    ).toThrow(/inStockQuantity/)
  })

  it('leaves committed/incoming unset — not defaulted to 0 — when unreported', () => {
    const result = transformInventoryLevel({ productId: 'prod-1', fulfillmentCenterId: 'fc-1', inStockQuantity: 10 })
    expect(result.committed).toBeUndefined()
    expect(result.incoming).toBeUndefined()
    expect(result.available).toBe(10)
  })
})
