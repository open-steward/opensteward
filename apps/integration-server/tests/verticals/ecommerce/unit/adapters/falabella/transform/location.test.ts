/**
 * Doc: https://developers.falabella.com/docs/orders/getwarehouse — field
 * names confirmed (name, sellerWarehouseId, isEnabled, isPickupStore, …);
 * no full response example was available at write time (see source file
 * header for exactly what is / isn't independently verified).
 */
import { describe, it, expect } from 'vitest'
import { transformLocation } from '../../../../../../../src/verticals/ecommerce/adapters/falabella/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

describe('transformLocation (Falabella)', () => {
  it('maps sellerWarehouseId/name/isEnabled', () => {
    const result = transformLocation({ sellerWarehouseId: 'ID01', name: 'Bodega Santiago', isEnabled: true })
    expect(result.id).toBe('ID01')
    expect(result.name).toBe('Bodega Santiago')
    expect(result.active).toBe(true)
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('treats a pickup store as not a fulfillment center', () => {
    const result = transformLocation({ sellerWarehouseId: 'ID02', name: 'Tienda', isPickupStore: true })
    expect(result.isFulfillmentCenter).toBe(false)
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const result = transformLocation({ sellerWarehouseId: 'ID01', name: 'Bodega Santiago', isEnabled: true })
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
