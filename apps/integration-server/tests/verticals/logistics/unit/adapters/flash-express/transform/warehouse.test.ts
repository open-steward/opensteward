import { describe, it, expect } from 'vitest'
import { transformWarehouse } from '../../../../../../../src/verticals/logistics/adapters/flash-express/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'
import { docWarehouses } from '../fixtures'

describe('flash-express transformWarehouse', () => {
  it('maps the documented example row onto the canonical warehouse', () => {
    const raw = docWarehouses()[0]!
    const w = WarehouseSchema.parse(transformWarehouse(raw))
    expect(w).toEqual({
      id: 'AAXXXX_001',
      code: 'AAXXXX_001',
      name: 'AAXXXX_001',
      address: {
        name: 'หอมรวม',
        street1: '68/5-6 ม.1 บ้านท่าบ่อ',
        street2: 'แจระแม',
        city: 'เมืองอุบลราชธานี',
        state: 'อุบลราชธานี',
        postalCode: '34000',
        phone: '0123456789',
      },
      metadata: raw,
    })
  })

  it('leaves country out: countryName is a name ("Thailand"), not ISO alpha-2', () => {
    const w = WarehouseSchema.parse(transformWarehouse(docWarehouses()[1]!))
    expect(w.address?.country).toBeUndefined()
    expect(w.metadata?.['countryName']).toBe('Thailand')
  })

  it('invents no active flag and no name from other fields', () => {
    const raw = { ...docWarehouses()[0]!, name: null }
    const w = WarehouseSchema.parse(transformWarehouse(raw))
    expect(w.isActive).toBeUndefined()
    expect(w.name).toBeUndefined()
  })

  it('omits the address when no address field is present', () => {
    const w = WarehouseSchema.parse(transformWarehouse({ warehouseNo: 'AAXXXX_009' }))
    expect(w.address).toBeUndefined()
    expect(w.id).toBe('AAXXXX_009')
  })
})
