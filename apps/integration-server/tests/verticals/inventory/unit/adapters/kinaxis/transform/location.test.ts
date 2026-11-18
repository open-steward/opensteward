import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawKinaxisSite,
} from '../../../../../../../src/verticals/inventory/adapters/kinaxis/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('kinaxis transformLocation', () => {
  const raw: RawKinaxisSite = {
    id: 'site-uuid-001',
    name: 'Toronto DC',
    siteCode: 'TOR-DC',
    siteType: 'Distribution',
    status: 'Active',
    parentSiteId: 'site-uuid-000',
    address: {
      street: '100 Harbour St',
      street2: 'Suite 200',
      city: 'Toronto',
      stateProvince: 'ON',
      country: 'CA',
      postalCode: 'M5J 1A7',
    },
    timeZone: 'America/Toronto',
  }

  it('maps id from raw.id', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('site-uuid-001')
    expect(result.externalId).toBe('site-uuid-001')
  })

  it('maps name', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Toronto DC')
  })

  it('maps code from siteCode', () => {
    const result = transformLocation(raw)
    expect(result.code).toBe('TOR-DC')
  })

  it('sets type to warehouse', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('maps parentLocationId from parentSiteId', () => {
    const result = transformLocation(raw)
    expect(result.parentLocationId).toBe('site-uuid-000')
  })

  it('maps address fields', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('100 Harbour St')
    expect(result.address?.line2).toBe('Suite 200')
    expect(result.address?.city).toBe('Toronto')
    expect(result.address?.region).toBe('ON')
    expect(result.address?.country).toBe('CA')
    expect(result.address?.postalCode).toBe('M5J 1A7')
  })

  it('sets isActive true when status=Active', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when status=Inactive', () => {
    const result = transformLocation({ ...raw, status: 'Inactive' })
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when status is missing', () => {
    const result = transformLocation({ id: 'x', status: undefined })
    expect(result.isActive).toBe(true)
  })

  it('sets platform to kinaxis', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('kinaxis')
  })

  it('produces output that satisfies LocationSchema', () => {
    expect(() => LocationSchema.parse(transformLocation(raw))).not.toThrow()
  })
})
