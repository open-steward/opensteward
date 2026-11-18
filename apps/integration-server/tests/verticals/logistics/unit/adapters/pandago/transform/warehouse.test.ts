import { describe, it, expect } from 'vitest'
import {
  transformWarehouse,
  type PandagoOutlet,
} from '../../../../../../../src/verticals/logistics/adapters/pandago/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeOutlet(overrides: Partial<PandagoOutlet> = {}): PandagoOutlet {
  return {
    client_vendor_id: 'vendor-001',
    vendor_id: 'v-001',
    name: 'Main Branch',
    address: '123 Raffles Place, Singapore',
    latitude: 1.284,
    longitude: 103.851,
    city: 'Singapore',
    phone_number: '+6562223333',
    currency: 'SGD',
    locale: 'en_SG',
    description: 'Central hub',
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('pandago transformWarehouse', () => {
  it('maps id from client_vendor_id', () => {
    expect(transformWarehouse(makeOutlet()).id).toBe('vendor-001')
  })

  it('falls back to vendor_id when client_vendor_id is null', () => {
    expect(transformWarehouse(makeOutlet({ client_vendor_id: null })).id).toBe('v-001')
  })

  it('maps name from name field', () => {
    expect(transformWarehouse(makeOutlet()).name).toBe('Main Branch')
  })

  it('maps code from client_vendor_id', () => {
    expect(transformWarehouse(makeOutlet()).code).toBe('vendor-001')
  })

  it('maps address.street1 from address field', () => {
    expect(transformWarehouse(makeOutlet()).address?.street1).toBe('123 Raffles Place, Singapore')
  })

  it('maps address.city from city field', () => {
    expect(transformWarehouse(makeOutlet()).address?.city).toBe('Singapore')
  })

  it('maps address.phone from phone_number', () => {
    expect(transformWarehouse(makeOutlet()).address?.phone).toBe('+6562223333')
  })

  it('sets isActive to true always', () => {
    expect(transformWarehouse(makeOutlet()).isActive).toBe(true)
  })

  it('omits address when address field is null/undefined', () => {
    const r = transformWarehouse(makeOutlet({ address: null }))
    expect(r.address).toBeUndefined()
  })

  it('passes metadata as raw object', () => {
    const raw = makeOutlet()
    expect(transformWarehouse(raw).metadata).toBe(raw)
  })

  it('passes WarehouseSchema validation', () => {
    expect(() => WarehouseSchema.parse(transformWarehouse(makeOutlet()))).not.toThrow()
  })
})
