import { describe, it, expect } from 'vitest'
import {
  transformDestinationToWarehouse,
  type LoopDestination,
} from '../../../../../../../src/verticals/logistics/adapters/loop-returns/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'

function makeRaw(overrides: Partial<LoopDestination> = {}): LoopDestination {
  return {
    id: 77,
    type: 'warehouse',
    name: 'Austin Warehouse',
    enabled: true,
    provider_location_id: 'loc-42',
    address: {
      address1: '100 Warehouse Blvd',
      address2: 'Suite 200',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      country: 'United States',
      country_code: 'US',
    },
    ...overrides,
  }
}

describe('loop-returns transformDestinationToWarehouse', () => {
  it('converts numeric id to string', () => {
    expect(transformDestinationToWarehouse(makeRaw({ id: 77 })).id).toBe('77')
  })

  it('converts string id to string', () => {
    expect(transformDestinationToWarehouse(makeRaw({ id: 'dest-77' })).id).toBe('dest-77')
  })

  it('id is undefined when id is null', () => {
    expect(transformDestinationToWarehouse(makeRaw({ id: null })).id).toBeUndefined()
  })

  it('maps name', () => {
    expect(transformDestinationToWarehouse(makeRaw({ name: 'Austin Warehouse' })).name).toBe(
      'Austin Warehouse',
    )
  })

  it('maps isActive from enabled', () => {
    expect(transformDestinationToWarehouse(makeRaw({ enabled: true })).isActive).toBe(true)
    expect(transformDestinationToWarehouse(makeRaw({ enabled: false })).isActive).toBe(false)
  })

  it('maps address.street1 from address.address1', () => {
    expect(transformDestinationToWarehouse(makeRaw()).address?.street1).toBe('100 Warehouse Blvd')
  })

  it('maps address.street2 from address.address2', () => {
    expect(transformDestinationToWarehouse(makeRaw()).address?.street2).toBe('Suite 200')
  })

  it('maps address.city', () => {
    expect(transformDestinationToWarehouse(makeRaw()).address?.city).toBe('Austin')
  })

  it('maps address.state', () => {
    expect(transformDestinationToWarehouse(makeRaw()).address?.state).toBe('TX')
  })

  it('maps address.postalCode from address.zip', () => {
    expect(transformDestinationToWarehouse(makeRaw()).address?.postalCode).toBe('78701')
  })

  it('prefers country_code over country for address.country', () => {
    expect(transformDestinationToWarehouse(makeRaw()).address?.country).toBe('US')
  })

  it('address is undefined when address is null', () => {
    expect(transformDestinationToWarehouse(makeRaw({ address: null })).address).toBeUndefined()
  })

  it('address is undefined when all address fields are absent', () => {
    const result = transformDestinationToWarehouse(makeRaw({ address: {} }))
    expect(result.address).toBeUndefined()
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    expect(transformDestinationToWarehouse(raw).metadata).toBe(raw)
  })

  it('passes WarehouseSchema validation', () => {
    const result = transformDestinationToWarehouse(makeRaw())
    expect(() => WarehouseSchema.parse(result)).not.toThrow()
  })
})
