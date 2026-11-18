import { describe, it, expect } from 'vitest'
import { transformLocation } from '../../../../../../../src/verticals/inventory/adapters/agiliron/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('transformLocation', () => {
  const raw = {
    StockLocation: 'Warehouse A',
    Address: '123 Main St',
    City: 'Portland',
    State: 'OR',
    Country: 'US',
    PostalCode: '97201',
  }

  it('maps StockLocation to id, name, and type', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('Warehouse A')
    expect(result.name).toBe('Warehouse A')
    expect(result.type).toBe('warehouse')
    expect(result.platform).toBe('agiliron')
    expect(result.isActive).toBe(true)
  })

  it('maps address fields', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('123 Main St')
    expect(result.address?.city).toBe('Portland')
    expect(result.address?.region).toBe('OR')
    expect(result.address?.country).toBe('US')
    expect(result.address?.postalCode).toBe('97201')
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })

  it('omits address when Address field is absent', () => {
    const result = transformLocation({ StockLocation: 'Zone B' })
    expect(result.id).toBe('Zone B')
    expect(result.address).toBeUndefined()
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
