import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawOngoingWmsGoodsOwner,
} from '../../../../../../../src/verticals/inventory/adapters/ongoing-wms/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('ongoing-wms transformLocation', () => {
  const raw: RawOngoingWmsGoodsOwner = {
    goodsOwnerId: 42,
    goodsOwnerName: 'Acme Warehouse',
    address: {
      address1: '100 Main St',
      address2: 'Unit 5',
      postCode: '94114',
      city: 'San Francisco',
      countryCode: 'US',
    },
  }

  it('maps id and externalId from goodsOwnerId', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps name from goodsOwnerName', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Acme Warehouse')
  })

  it('sets type to warehouse', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('maps address fields from nested address object', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('100 Main St')
    expect(result.address?.city).toBe('San Francisco')
    expect(result.address?.country).toBe('US')
    expect(result.address?.postalCode).toBe('94114')
  })

  it('sets isActive to true', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets platform to ongoing-wms', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('ongoing-wms')
  })

  it('returns undefined address when address is absent', () => {
    const result = transformLocation({ goodsOwnerId: 1, goodsOwnerName: 'No Addr' })
    expect(result.address).toBeUndefined()
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
