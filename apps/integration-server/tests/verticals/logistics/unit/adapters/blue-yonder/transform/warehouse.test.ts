import { describe, it, expect } from 'vitest'
import {
  transformWarehouse,
  type BlueYonderWarehouseResponse,
} from '../../../../../../../src/verticals/logistics/adapters/blue-yonder/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'

// ─── Factory ──────────────────────────────────────────────────────────────────

function makeRaw(
  overrides: Partial<BlueYonderWarehouseResponse> = {},
): BlueYonderWarehouseResponse {
  return {
    warehouseId: 'BY-WH-001',
    name: 'Memphis Distribution Center',
    code: 'MEM1',
    streetAddress: '500 Logistics Pkwy',
    streetAddress2: 'Building A',
    city: 'Memphis',
    stateOrProvince: 'TN',
    postalCode: '38101',
    countryCode: 'US',
    phone: '+1-901-555-0100',
    email: 'mem1@blueyonder.example',
    isActive: true,
    timezone: 'America/Chicago',
    cutoffTime: '17:00',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

// ─── transformWarehouse ───────────────────────────────────────────────────────

describe('transformWarehouse', () => {
  it('maps id from warehouseId', () => {
    expect(transformWarehouse(makeRaw()).id).toBe('BY-WH-001')
  })

  it('maps name from raw.name', () => {
    expect(transformWarehouse(makeRaw()).name).toBe('Memphis Distribution Center')
  })

  it('maps code from raw.code', () => {
    expect(transformWarehouse(makeRaw()).code).toBe('MEM1')
  })

  it('maps isActive from raw.isActive', () => {
    expect(transformWarehouse(makeRaw({ isActive: true })).isActive).toBe(true)
    expect(transformWarehouse(makeRaw({ isActive: false })).isActive).toBe(false)
  })

  it('defaults isActive to true when raw.isActive is undefined', () => {
    expect(transformWarehouse(makeRaw({ isActive: undefined })).isActive).toBe(true)
  })

  it('maps timezone from raw.timezone', () => {
    expect(transformWarehouse(makeRaw()).timezone).toBe('America/Chicago')
  })

  it('maps cutoffTime from raw.cutoffTime', () => {
    expect(transformWarehouse(makeRaw()).cutoffTime).toBe('17:00')
  })

  // ── Address mapping ──────────────────────────────────────────────────────

  it('maps address when address fields are present', () => {
    const result = transformWarehouse(makeRaw())
    expect(result.address?.street1).toBe('500 Logistics Pkwy')
    expect(result.address?.street2).toBe('Building A')
    expect(result.address?.city).toBe('Memphis')
    expect(result.address?.state).toBe('TN')
    expect(result.address?.postalCode).toBe('38101')
    expect(result.address?.country).toBe('US')
    expect(result.address?.phone).toBe('+1-901-555-0100')
    expect(result.address?.email).toBe('mem1@blueyonder.example')
  })

  it('returns undefined address when all address fields are absent', () => {
    const result = transformWarehouse(
      makeRaw({
        streetAddress: undefined,
        streetAddress2: undefined,
        city: undefined,
        stateOrProvince: undefined,
        postalCode: undefined,
        countryCode: undefined,
      }),
    )
    expect(result.address).toBeUndefined()
  })

  it('builds address from only city when other address fields are absent', () => {
    const result = transformWarehouse(
      makeRaw({
        streetAddress: undefined,
        stateOrProvince: undefined,
        postalCode: undefined,
        countryCode: undefined,
        city: 'Memphis',
      }),
    )
    expect(result.address?.city).toBe('Memphis')
    expect(result.address?.street1).toBeUndefined()
  })

  // ── Date mapping ─────────────────────────────────────────────────────────

  it('maps createdAt as a Date', () => {
    expect(transformWarehouse(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt as a Date', () => {
    expect(transformWarehouse(makeRaw()).updatedAt).toBeInstanceOf(Date)
  })

  // ── Metadata ─────────────────────────────────────────────────────────────

  it('passes metadata as the raw response', () => {
    const raw = makeRaw()
    expect(transformWarehouse(raw).metadata).toBe(raw)
  })

  // ── Schema validation ─────────────────────────────────────────────────────

  it('passes WarehouseSchema validation', () => {
    expect(() => WarehouseSchema.parse(transformWarehouse(makeRaw()))).not.toThrow()
  })

  it('passes WarehouseSchema validation with minimal raw data', () => {
    const raw: BlueYonderWarehouseResponse = { warehouseId: 'BY-MIN-001' }
    expect(() => WarehouseSchema.parse(transformWarehouse(raw))).not.toThrow()
  })
})
