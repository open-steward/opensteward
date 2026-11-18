import { describe, it, expect } from 'vitest'
import {
  transformWarehouse,
  type IthinkLogisticsWarehouseRaw,
} from '../../../../../../../src/verticals/logistics/adapters/ithink-logistics/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'
import { docWarehouseRow } from '../fixtures'

const row = (o: Partial<IthinkLogisticsWarehouseRaw> = {}) =>
  ({ ...docWarehouseRow(), ...o }) as IthinkLogisticsWarehouseRaw

describe('ithink-logistics transformWarehouse (documented warehouse/get.json row)', () => {
  it('parses against WarehouseSchema with the documented fields', () => {
    const w = WarehouseSchema.parse(transformWarehouse(row()))
    expect(w).toMatchObject({
      id: '2474',
      name: 'ITL',
      isActive: true,
      address: {
        company: 'ITL',
        street1: '104, Shreeji Sharan',
        street2: 'Kandivali West',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: 'Kandivali West',
        phone: '+91 9876543210',
      },
    })
  })

  it('leaves the country name out of the ISO country field', () => {
    const w = WarehouseSchema.parse(transformWarehouse(row()))
    expect(w.address?.country).toBeUndefined()
    expect(w.metadata?.['country_name']).toBe('India')
  })

  it('does not read an undocumented status as inactive', () => {
    expect(transformWarehouse(row({ status: 'pending' })).isActive).toBeUndefined()
  })

  it('throws on a row with no id', () => {
    expect(() => transformWarehouse(row({ id: null }))).toThrow(/no id/)
  })
})
