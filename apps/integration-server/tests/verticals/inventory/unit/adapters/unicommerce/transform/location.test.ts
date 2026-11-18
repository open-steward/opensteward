import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawUnicommerceFacility,
  type RawUnicommerceFacilitySummary,
} from '../../../../../../../src/verticals/inventory/adapters/unicommerce/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

function makeFull(overrides: Partial<RawUnicommerceFacility> = {}): RawUnicommerceFacility {
  return {
    code: 'WH-DELHI',
    name: 'Delhi Warehouse',
    displayName: 'Delhi Main WH',
    type: 'WAREHOUSE',
    operationalType: 'STANDARD',
    alternateCode: 'DL1',
    enabled: true,
    billingAddress: {
      addressLine1: '10 Industrial Area',
      addressLine2: 'Phase II',
      city: 'Delhi',
      pincode: '110001',
      stateName: 'Delhi',
      stateCode: 'DL',
      countryName: 'India',
      countryCode: 'IN',
      phone: '+911123456789',
      email: 'wh@example.com',
    },
    ...overrides,
  }
}

function makeSummary(
  overrides: Partial<RawUnicommerceFacilitySummary> = {},
): RawUnicommerceFacilitySummary {
  return {
    facilityCode: 'WH-MUM',
    facilityStatus: 'ENABLED',
    created: '2024-03-01T00:00:00Z',
    updated: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformLocation (unicommerce) — full facility', () => {
  it('maps id and externalId from code', () => {
    const result = transformLocation(makeFull({ code: 'WH-DELHI' }))
    expect(result.id).toBe('WH-DELHI')
    expect(result.externalId).toBe('WH-DELHI')
  })

  it('prefers displayName over name for the name field', () => {
    const result = transformLocation(
      makeFull({ displayName: 'Delhi Main WH', name: 'Delhi Warehouse' }),
    )
    expect(result.name).toBe('Delhi Main WH')
  })

  it('falls back to name when displayName is absent', () => {
    const result = transformLocation(makeFull({ displayName: undefined, name: 'Delhi Warehouse' }))
    expect(result.name).toBe('Delhi Warehouse')
  })

  it('type is always "warehouse"', () => {
    const result = transformLocation(makeFull())
    expect(result.type).toBe('warehouse')
  })

  it('uses shippingAddress over billingAddress for address when shippingAddress present', () => {
    const raw = makeFull({
      shippingAddress: {
        addressLine1: '99 Ship Lane',
        city: 'Mumbai',
        pincode: '400001',
        stateName: 'Maharashtra',
        countryCode: 'IN',
      },
    })
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('99 Ship Lane')
    expect(result.address?.city).toBe('Mumbai')
  })

  it('maps address from billingAddress when shippingAddress is absent', () => {
    const result = transformLocation(makeFull())
    expect(result.address?.line1).toBe('10 Industrial Area')
    expect(result.address?.postalCode).toBe('110001')
  })

  it('maps region from stateName, with stateCode fallback', () => {
    const result = transformLocation(makeFull())
    expect(result.address?.region).toBe('Delhi')

    const withoutStateName = makeFull({
      billingAddress: { ...makeFull().billingAddress, stateName: undefined, stateCode: 'DL' },
    })
    expect(transformLocation(withoutStateName).address?.region).toBe('DL')
  })

  it('maps country from countryCode, with countryName fallback', () => {
    const result = transformLocation(makeFull())
    expect(result.address?.country).toBe('IN')

    const withoutCountryCode = makeFull({
      billingAddress: {
        ...makeFull().billingAddress,
        countryCode: undefined,
        countryName: 'India',
      },
    })
    expect(transformLocation(withoutCountryCode).address?.country).toBe('India')
  })

  it('isActive is true when enabled is true', () => {
    expect(transformLocation(makeFull({ enabled: true })).isActive).toBe(true)
  })

  it('isActive is false when enabled is false', () => {
    expect(transformLocation(makeFull({ enabled: false })).isActive).toBe(false)
  })

  it('isActive defaults to true when enabled is absent', () => {
    expect(transformLocation(makeFull({ enabled: undefined })).isActive).toBe(true)
  })

  it('platform is "unicommerce"', () => {
    expect(transformLocation(makeFull()).platform).toBe('unicommerce')
  })

  it('passes LocationSchema validation', () => {
    const result = transformLocation(makeFull())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('transformLocation (unicommerce) — summary facility', () => {
  it('maps id and externalId from facilityCode', () => {
    const result = transformLocation(makeSummary({ facilityCode: 'WH-MUM' }))
    expect(result.id).toBe('WH-MUM')
    expect(result.externalId).toBe('WH-MUM')
  })

  it('isActive is true when facilityStatus is ENABLED', () => {
    expect(transformLocation(makeSummary({ facilityStatus: 'ENABLED' })).isActive).toBe(true)
  })

  it('isActive is false when facilityStatus is not ENABLED', () => {
    expect(transformLocation(makeSummary({ facilityStatus: 'DISABLED' })).isActive).toBe(false)
  })

  it('type is always "warehouse"', () => {
    expect(transformLocation(makeSummary()).type).toBe('warehouse')
  })

  it('platform is "unicommerce"', () => {
    expect(transformLocation(makeSummary()).platform).toBe('unicommerce')
  })

  it('address is undefined (summary has no address data)', () => {
    expect(transformLocation(makeSummary()).address).toBeUndefined()
  })

  it('passes LocationSchema validation', () => {
    const result = transformLocation(makeSummary())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
