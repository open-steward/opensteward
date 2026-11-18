import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  untransformLocation,
  type RawCLStockLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/commercelayer/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeStockLocation(overrides: Partial<RawCLStockLocation> = {}): RawCLStockLocation {
  return {
    id: 'loc-001',
    name: 'US East Warehouse',
    label_format: 'PDF',
    address: {
      line_1: '123 Commerce St',
      line_2: 'Suite 400',
      city: 'New York',
      state_code: 'NY',
      zip_code: '10001',
      country_code: 'US',
      phone: '+1-555-0100',
    },
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-03-01T12:00:00.000Z',
    _type: 'stock_locations',
    ...overrides,
  }
}

describe('transformLocation (Commerce Layer)', () => {
  it('maps core fields', () => {
    const result = transformLocation(makeStockLocation())
    expect(result.id).toBe('loc-001')
    expect(result.name).toBe('US East Warehouse')
    expect(result.active).toBe(true)
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('maps address', () => {
    const result = transformLocation(makeStockLocation())
    expect(result.address?.line1).toBe('123 Commerce St')
    expect(result.address?.line2).toBe('Suite 400')
    expect(result.address?.city).toBe('New York')
    expect(result.address?.region).toBe('NY')
    expect(result.address?.postalCode).toBe('10001')
    expect(result.address?.country).toBe('US')
  })

  it('maps phone from address', () => {
    const result = transformLocation(makeStockLocation())
    expect(result.phone).toBe('+1-555-0100')
  })

  it('handles missing address', () => {
    const result = transformLocation(makeStockLocation({ address: undefined }))
    expect(result.address).toBeUndefined()
    expect(result.phone).toBeUndefined()
  })

  it('handles missing name', () => {
    const result = transformLocation(makeStockLocation({ name: undefined }))
    expect(result.name).toBe('')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeStockLocation()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const result = transformLocation(makeStockLocation())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('untransformLocation (Commerce Layer)', () => {
  it('produces JSON:API body', () => {
    const body = untransformLocation({
      name: 'EU Warehouse',
    }) as { data: { type: string; attributes: Record<string, unknown> } }
    expect(body.data.type).toBe('stock_locations')
    expect(body.data.attributes['name']).toBe('EU Warehouse')
  })
})
