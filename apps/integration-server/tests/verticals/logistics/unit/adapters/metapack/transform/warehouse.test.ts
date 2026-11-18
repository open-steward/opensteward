/**
 * Metapack warehouses. Fixture is the documented example response of
 * GET /shipping/v1/shippingLocations (https://dev.metapack.com/shipping/guides/get-warehouses/):
 *   [{ "code": "DEFAULT", "name": "default" }]
 */
import { describe, it, expect } from 'vitest'
import { transformWarehouse } from '../../../../../../../src/verticals/logistics/adapters/metapack/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'

describe('metapack transformWarehouse', () => {
  it('parses with WarehouseSchema; the code is the id', () => {
    const w = WarehouseSchema.parse(transformWarehouse({ code: 'DEFAULT', name: 'default' }))
    expect(w.id).toBe('DEFAULT')
    expect(w.code).toBe('DEFAULT')
    expect(w.name).toBe('default')
  })

  it('invents nothing the documented shape lacks', () => {
    const w = WarehouseSchema.parse(transformWarehouse({ code: 'DEFAULT', name: 'default' }))
    expect(w.isActive).toBeUndefined()
    expect(w.address).toBeUndefined()
    expect(w.metadata).toEqual({ code: 'DEFAULT', name: 'default' })
  })
})
