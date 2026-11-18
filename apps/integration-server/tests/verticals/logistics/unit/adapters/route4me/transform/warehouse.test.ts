import { describe, it, expect } from 'vitest'
import {
  transformWarehouse,
  type Route4MeDepot,
} from '../../../../../../../src/verticals/logistics/adapters/route4me/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'

function makeDepot(overrides: Partial<Route4MeDepot> = {}): Route4MeDepot {
  return {
    address_id: 7,
    address_alias: 'Downtown Depot',
    first_name: 'Wanda',
    last_name: 'Warehouse',
    address_1: '500 Logistics Blvd',
    address_2: 'Suite 2',
    address_city: 'Nashville',
    address_state_id: 'TN',
    address_country_id: 'US',
    address_zip: '37201',
    address_email: 'depot@example.com',
    address_phone_number: '+16155550001',
    cached_lat: 36.1627,
    cached_lng: -86.7816,
    local_timezone_string: 'America/Chicago',
    // 17:00 = 17*3600 = 61200 seconds
    local_time_window_end: 61200,
    created_timestamp: Math.floor(new Date('2024-03-01T00:00:00Z').getTime() / 1000),
    ...overrides,
  }
}

describe('route4me transformWarehouse', () => {
  it('maps id from address_id as string', () => {
    expect(transformWarehouse(makeDepot()).id).toBe('7')
  })

  it('prefers address_alias for name', () => {
    expect(transformWarehouse(makeDepot()).name).toBe('Downtown Depot')
  })

  it('falls back to full name when no alias', () => {
    const r = transformWarehouse(makeDepot({ address_alias: null }))
    expect(r.name).toBe('Wanda Warehouse')
  })

  it('maps address city and state', () => {
    const r = transformWarehouse(makeDepot())
    expect(r.address?.city).toBe('Nashville')
    expect(r.address?.state).toBe('TN')
  })

  it('maps address street and zip', () => {
    const r = transformWarehouse(makeDepot())
    expect(r.address?.street1).toBe('500 Logistics Blvd')
    expect(r.address?.postalCode).toBe('37201')
  })

  it('maps isActive as true', () => {
    expect(transformWarehouse(makeDepot()).isActive).toBe(true)
  })

  it('maps timezone', () => {
    expect(transformWarehouse(makeDepot()).timezone).toBe('America/Chicago')
  })

  it('formats cutoffTime as HH:MM from seconds', () => {
    // 61200 seconds = 17:00
    expect(transformWarehouse(makeDepot()).cutoffTime).toBe('17:00')
  })

  it('maps createdAt from created_timestamp', () => {
    expect(transformWarehouse(makeDepot()).createdAt).toBeInstanceOf(Date)
  })

  it('preserves raw metadata', () => {
    const raw = makeDepot()
    expect(transformWarehouse(raw).metadata).toBe(raw)
  })

  it('passes WarehouseSchema validation', () => {
    const result = transformWarehouse(makeDepot())
    expect(() => WarehouseSchema.parse(result)).not.toThrow()
  })

  it('handles null cutoff gracefully', () => {
    const r = transformWarehouse(makeDepot({ local_time_window_end: null }))
    expect(r.cutoffTime).toBeUndefined()
  })

  it('handles null address_id gracefully', () => {
    const r = transformWarehouse(makeDepot({ address_id: null }))
    expect(r.id).toBeUndefined()
  })

  it('formats single-digit hour correctly', () => {
    // 9:05 = 9*3600 + 5*60 = 32700 seconds → "09:05"
    const r = transformWarehouse(makeDepot({ local_time_window_end: 32700 }))
    expect(r.cutoffTime).toBe('09:05')
  })
})
