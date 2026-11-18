import { describe, it, expect } from 'vitest'
import {
  transformWarehouse,
  type TrimbleTruckmateWarehouseResponse,
} from '../../../../../../../src/verticals/logistics/adapters/trimble-truckmate/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'

function makeWarehouse(
  overrides: Partial<TrimbleTruckmateWarehouseResponse> = {},
): TrimbleTruckmateWarehouseResponse {
  return {
    siteId: 'SITE-001',
    siteName: 'Nashville Hub',
    siteCode: 'NSH1',
    address: {
      address: '300 Warehouse Blvd',
      city: 'Nashville',
      state: 'TN',
      zipCode: '37201',
      country: 'US',
    },
    isActive: true,
    timezone: 'America/Chicago',
    cutoffTime: '17:00',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('trimble-truckmate transformWarehouse', () => {
  it('maps id from siteId', () => {
    expect(transformWarehouse(makeWarehouse()).id).toBe('SITE-001')
  })

  it('maps name from siteName', () => {
    expect(transformWarehouse(makeWarehouse()).name).toBe('Nashville Hub')
  })

  it('maps code from siteCode', () => {
    expect(transformWarehouse(makeWarehouse()).code).toBe('NSH1')
  })

  it('maps address city and state', () => {
    const result = transformWarehouse(makeWarehouse())
    expect(result.address?.city).toBe('Nashville')
    expect(result.address?.state).toBe('TN')
  })

  it('maps address country', () => {
    expect(transformWarehouse(makeWarehouse()).address?.country).toBe('US')
  })

  it('maps isActive', () => {
    expect(transformWarehouse(makeWarehouse()).isActive).toBe(true)
  })

  it('maps timezone', () => {
    expect(transformWarehouse(makeWarehouse()).timezone).toBe('America/Chicago')
  })

  it('maps cutoffTime', () => {
    expect(transformWarehouse(makeWarehouse()).cutoffTime).toBe('17:00')
  })

  it('maps createdAt and updatedAt as Date', () => {
    const result = transformWarehouse(makeWarehouse())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('falls back id to raw.id', () => {
    expect(transformWarehouse(makeWarehouse({ siteId: undefined, id: 'ID-001' })).id).toBe('ID-001')
  })

  it('falls back name to raw.name', () => {
    expect(
      transformWarehouse(makeWarehouse({ siteName: undefined, name: 'Fallback Name' })).name,
    ).toBe('Fallback Name')
  })

  it('falls back address to location field', () => {
    const result = transformWarehouse(
      makeWarehouse({
        address: undefined,
        location: { city: 'Memphis', state: 'TN', zipCode: '38101', country: 'US' },
      }),
    )
    expect(result.address?.city).toBe('Memphis')
  })

  it('passes metadata through', () => {
    const raw = makeWarehouse()
    expect(transformWarehouse(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => WarehouseSchema.parse(transformWarehouse(makeWarehouse()))).not.toThrow()
  })
})
