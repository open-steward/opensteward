import { describe, it, expect } from 'vitest'
import { transformWarehouse } from '../../../../../../../src/verticals/logistics/adapters/mylerz/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'
import { docWarehouse } from '../fixtures'

describe('transformWarehouse (mylerz)', () => {
  it('maps the documented warehouseDTO and parses as a Warehouse', () => {
    const out = WarehouseSchema.parse(transformWarehouse(docWarehouse()))
    expect(out).toEqual({
      id: 'sample string 3',
      name: 'sample string 3',
      address: { name: 'sample string 10', phone: 'sample string 9', street1: 'sample string 8' },
      metadata: docWarehouse(),
    })
  })

  it('does not invent isActive, a city or a state', () => {
    const out = transformWarehouse(docWarehouse())
    expect(out.isActive).toBeUndefined()
    expect(out.address?.city).toBeUndefined()
    expect(out.address?.state).toBeUndefined()
  })

  it('omits the address when none of its fields is present', () => {
    const raw = { ...docWarehouse(), Address: null, ContactName: null, PhoneNumber: null }
    expect(WarehouseSchema.parse(transformWarehouse(raw)).address).toBeUndefined()
  })

  it('throws on a row without a Name, the only key Mylerz documents', () => {
    expect(() => transformWarehouse({ ...docWarehouse(), Name: null })).toThrow(/Name/)
  })
})
