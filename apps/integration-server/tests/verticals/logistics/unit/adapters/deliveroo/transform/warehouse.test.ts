import { describe, it, expect } from 'vitest'
import {
  transformWarehouse,
  type DeliverooRestaurantRaw,
} from '../../../../../../../src/verticals/logistics/adapters/deliveroo/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'

function makeRestaurant(overrides: Partial<DeliverooRestaurantRaw> = {}): DeliverooRestaurantRaw {
  return {
    id: 'site-001',
    restaurant_id: 'rest-456',
    name: 'Central Kitchen',
    visible: true,
    status: 'online',
    address: {
      address1: '10 High Street',
      address2: 'Floor 2',
      city: 'Manchester',
      postcode: 'M1 1AD',
      country_code: 'GB',
    },
    estimated_delivery_time: 30,
    timezone: 'Europe/London',
    ...overrides,
  }
}

describe('deliveroo transformWarehouse', () => {
  it('prefers restaurant_id over id', () => {
    const result = transformWarehouse(makeRestaurant())
    expect(result.id).toBe('rest-456')
  })

  it('falls back to id when restaurant_id absent', () => {
    const result = transformWarehouse(makeRestaurant({ restaurant_id: null }))
    expect(result.id).toBe('site-001')
  })

  it('maps name', () => {
    const result = transformWarehouse(makeRestaurant())
    expect(result.name).toBe('Central Kitchen')
  })

  it('maps visible to isActive', () => {
    const result = transformWarehouse(makeRestaurant())
    expect(result.isActive).toBe(true)
  })

  it('maps visible false to isActive false', () => {
    const result = transformWarehouse(makeRestaurant({ visible: false }))
    expect(result.isActive).toBe(false)
  })

  it('maps timezone', () => {
    const result = transformWarehouse(makeRestaurant())
    expect(result.timezone).toBe('Europe/London')
  })

  it('maps address city', () => {
    const result = transformWarehouse(makeRestaurant())
    expect(result.address?.city).toBe('Manchester')
  })

  it('maps address postal_code from postcode', () => {
    const result = transformWarehouse(makeRestaurant())
    expect(result.address?.postalCode).toBe('M1 1AD')
  })

  it('maps address country from country_code', () => {
    const result = transformWarehouse(makeRestaurant())
    expect(result.address?.country).toBe('GB')
  })

  it('passes schema validation', () => {
    const result = transformWarehouse(makeRestaurant())
    expect(() => WarehouseSchema.parse(result)).not.toThrow()
  })

  it('handles null address', () => {
    const result = transformWarehouse(makeRestaurant({ address: null }))
    expect(result.address).toBeUndefined()
    expect(() => WarehouseSchema.parse(result)).not.toThrow()
  })
})
