/**
 * Doc: https://developers.falabella.com/docs/products/getstock and
 * .../products/updatestock (verbatim XML examples quoted in the source file
 * header).
 */
import { describe, it, expect } from 'vitest'
import {
  transformSellerWarehouseStock,
  transformFulfillmentWarehouseStock,
  untransformInventoryLevel,
} from '../../../../../../../src/verticals/ecommerce/adapters/falabella/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

describe('transformSellerWarehouseStock (Falabella)', () => {
  it('keys id/variantId/locationId on SellerSku and SellerWarehouseId', () => {
    const result = transformSellerWarehouseStock({
      SellerWarehouseId: 'ID01',
      SellerSku: 'Test1',
      Quantity: 138,
    })
    expect(result.id).toBe('Test1:ID01')
    expect(result.variantId).toBe('Test1')
    expect(result.locationId).toBe('ID01')
    expect(result.available).toBe(138)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformSellerWarehouseStock({ SellerWarehouseId: 'ID01', SellerSku: 'Test1', Quantity: 138 })
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformFulfillmentWarehouseStock (Falabella)', () => {
  it('keys locationId on WarehouseId (a distinct id space from SellerWarehouseId)', () => {
    const result = transformFulfillmentWarehouseStock({
      WarehouseId: '6001',
      SellerSku: 'Test1',
      Quantity: 2,
    })
    expect(result.id).toBe('Test1:6001')
    expect(result.locationId).toBe('6001')
    expect(result.available).toBe(2)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformFulfillmentWarehouseStock({ WarehouseId: '6001', SellerSku: 'Test1', Quantity: 2 })
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})

describe('untransformInventoryLevel (Falabella)', () => {
  it('builds the confirmed UpdateStock XML shape', () => {
    const xml = untransformInventoryLevel({ variantId: 'abc02', available: 234 })
    expect(xml).toContain('<SellerSku>abc02</SellerSku>')
    expect(xml).toContain('<Quantity>234</Quantity>')
    expect(xml).not.toContain('SellerWarehouseId')
  })

  it('includes SellerWarehouseId when a locationId is supplied', () => {
    const xml = untransformInventoryLevel({ variantId: 'abc02', available: 234, locationId: 'ID01' })
    expect(xml).toContain('<SellerWarehouseId>ID01</SellerWarehouseId>')
  })
})
