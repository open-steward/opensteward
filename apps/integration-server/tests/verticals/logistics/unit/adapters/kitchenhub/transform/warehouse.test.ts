import { describe, it, expect } from 'vitest'
import { transformStore } from '../../../../../../../src/verticals/logistics/adapters/kitchenhub/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'
import { documentedStore } from '../fixtures/documented'

describe('kitchenhub transformStore (StoreRetrieveResponseSerializer)', () => {
  it('parses with WarehouseSchema', () => {
    expect(() => WarehouseSchema.parse(transformStore(documentedStore()))).not.toThrow()
  })

  it('maps id, store_name and partner_store_id', () => {
    const w = WarehouseSchema.parse(transformStore(documentedStore()))
    expect(w.id).toBe('store_001')
    expect(w.name).toBe('Main Brand')
    expect(w.code).toBe('partner_store_001')
  })

  it('maps street, city, state and zipcode, and leaves the undocumented-format country out', () => {
    expect(transformStore(documentedStore()).address).toEqual({
      street1: '19 North Park Avenue',
      city: 'Rockville Centre',
      state: 'NY',
      postalCode: '11570',
    })
  })

  it('omits the address when the store has none', () => {
    const raw = { id: 's', country: 'US', created_at: '2024-10-09T07:44:21Z' }
    expect(transformStore(raw).address).toBeUndefined()
  })

  it('maps created_at', () => {
    expect(transformStore(documentedStore()).createdAt?.toISOString()).toBe(
      '2024-10-09T07:44:21.885Z',
    )
  })
})
