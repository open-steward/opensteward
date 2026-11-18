import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawSkulabsWarehouse,
} from '../../../../../../../src/verticals/inventory/adapters/skulabs/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('skulabs transformLocation', () => {
  const raw: RawSkulabsWarehouse = {
    _id: 'wh-abc',
    name: 'Primary Warehouse',
    type: 'standard',
    store_id: 'store-001',
    is_default: true,
    address: {
      address: '100 Commerce Blvd',
      city: 'Austin',
      state: 'TX',
      postal_code: '78701',
      country_code: 'US',
      phone: '+15125550199',
      company: 'ACME LLC',
      name: 'Warehouse Manager',
    },
  }

  it('maps _id to id and externalId', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('wh-abc')
    expect(result.externalId).toBe('wh-abc')
  })

  it('maps name to name', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Primary Warehouse')
  })

  it('maps address.address to address.line1', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('100 Commerce Blvd')
  })

  it('maps address.state to address.region', () => {
    const result = transformLocation(raw)
    expect(result.address?.region).toBe('TX')
  })

  it('maps address.country_code to address.country', () => {
    const result = transformLocation(raw)
    expect(result.address?.country).toBe('US')
  })

  it('maps address.postal_code to address.postalCode', () => {
    const result = transformLocation(raw)
    expect(result.address?.postalCode).toBe('78701')
  })

  it('hardcodes isActive to true', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets platform to skulabs', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('skulabs')
  })

  it('returns undefined address when address object absent', () => {
    const noAddr: RawSkulabsWarehouse = { _id: 'wh-2', name: 'Simple' }
    expect(transformLocation(noAddr).address).toBeUndefined()
  })

  it('satisfies LocationSchema', () => {
    expect(() => LocationSchema.parse(transformLocation(raw))).not.toThrow()
  })
})
