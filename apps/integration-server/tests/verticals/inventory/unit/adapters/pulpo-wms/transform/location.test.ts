import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawPulpoWmsLocation,
} from '../../../../../../../src/verticals/inventory/adapters/pulpo-wms/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('pulpo-wms transformLocation', () => {
  const raw: RawPulpoWmsLocation = {
    id: 'wh-001',
    name: 'Main Warehouse',
    code: 'MAIN',
    type: 'storage',
    is_active: true,
    is_default: false,
    parent_id: 'wh-000',
    address: {
      street: '1 Logistics Way',
      street2: 'Suite 100',
      city: 'Hamburg',
      state: 'HH',
      country: 'DE',
      postal_code: '20095',
    },
  }

  it('maps id, name and type', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('wh-001')
    expect(result.name).toBe('Main Warehouse')
    expect(result.type).toBe('warehouse')
    expect(result.platform).toBe('pulpo-wms')
  })

  it('maps address fields including postal_code fallback', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('1 Logistics Way')
    expect(result.address?.line2).toBe('Suite 100')
    expect(result.address?.city).toBe('Hamburg')
    expect(result.address?.region).toBe('HH')
    expect(result.address?.country).toBe('DE')
    expect(result.address?.postalCode).toBe('20095')
  })

  it('maps parentLocationId from parent_id', () => {
    const result = transformLocation(raw)
    expect(result.parentLocationId).toBe('wh-000')
  })

  it('prefers postal_code over zip', () => {
    const result = transformLocation({
      ...raw,
      address: { zip: '99999', postal_code: '20095' },
    })
    expect(result.address?.postalCode).toBe('20095')
  })

  it('falls back to zip when postal_code is absent', () => {
    const result = transformLocation({
      ...raw,
      address: { zip: '20095' },
    })
    expect(result.address?.postalCode).toBe('20095')
  })

  it('omits address when address object is absent', () => {
    const result = transformLocation({ id: 'wh-002' })
    expect(result.address).toBeUndefined()
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })

  it('defaults isActive to true when is_active is undefined', () => {
    const result = transformLocation({ id: 'wh-003' })
    expect(result.isActive).toBe(true)
  })
})
