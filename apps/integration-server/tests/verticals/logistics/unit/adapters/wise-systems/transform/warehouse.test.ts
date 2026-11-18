import { describe, it, expect } from 'vitest'
import {
  transformWarehouse,
  type WiseSystemsDepot,
} from '../../../../../../../src/verticals/logistics/adapters/wise-systems/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'

function makeRaw(overrides: Partial<WiseSystemsDepot> = {}): WiseSystemsDepot {
  return {
    id: 'depot-ws-001',
    name: 'Austin Depot',
    code: 'AUS1',
    active: true,
    timezone: 'America/Chicago',
    client_id: 'client-42',
    address: {
      id: 'addr-1',
      address1: '999 Depot Lane',
      address2: 'Unit B',
      city: 'Austin',
      state: 'TX',
      postal_code: '78701',
      country: 'US',
      lat: 30.2672,
      lng: -97.7431,
      name: 'Austin Depot HQ',
      phone: '555-999-0000',
    },
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T08:00:00Z',
    ...overrides,
  }
}

describe('transformWarehouse (wise-systems)', () => {
  it('maps id from raw.id', () => {
    expect(transformWarehouse(makeRaw()).id).toBe('depot-ws-001')
  })

  it('maps name from raw.name', () => {
    expect(transformWarehouse(makeRaw()).name).toBe('Austin Depot')
  })

  it('maps code from raw.code', () => {
    expect(transformWarehouse(makeRaw()).code).toBe('AUS1')
  })

  it('maps isActive from raw.active', () => {
    expect(transformWarehouse(makeRaw()).isActive).toBe(true)
  })

  it('maps isActive false when raw.active is false', () => {
    expect(transformWarehouse(makeRaw({ active: false })).isActive).toBe(false)
  })

  it('maps timezone from raw.timezone', () => {
    expect(transformWarehouse(makeRaw()).timezone).toBe('America/Chicago')
  })

  it('maps address city from raw.address.city', () => {
    expect(transformWarehouse(makeRaw()).address?.city).toBe('Austin')
  })

  it('maps address state from raw.address.state', () => {
    expect(transformWarehouse(makeRaw()).address?.state).toBe('TX')
  })

  it('maps address postalCode from raw.address.postal_code', () => {
    expect(transformWarehouse(makeRaw()).address?.postalCode).toBe('78701')
  })

  it('maps address country from raw.address.country', () => {
    expect(transformWarehouse(makeRaw()).address?.country).toBe('US')
  })

  it('maps address street1 from raw.address.address1', () => {
    expect(transformWarehouse(makeRaw()).address?.street1).toBe('999 Depot Lane')
  })

  it('sets address undefined when raw.address is null', () => {
    expect(transformWarehouse(makeRaw({ address: null })).address).toBeUndefined()
  })

  it('maps createdAt from raw.created_at', () => {
    expect(transformWarehouse(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt from raw.updated_at', () => {
    expect(transformWarehouse(makeRaw()).updatedAt).toBeInstanceOf(Date)
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformWarehouse(raw).metadata).toBe(raw)
  })

  it('produces output that parses against WarehouseSchema', () => {
    expect(() => WarehouseSchema.parse(transformWarehouse(makeRaw()))).not.toThrow()
  })
})
