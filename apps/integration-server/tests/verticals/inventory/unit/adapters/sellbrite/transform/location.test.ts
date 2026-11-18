import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawSellbriteWarehouse,
} from '../../../../../../../src/verticals/inventory/adapters/sellbrite/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('sellbrite transformLocation', () => {
  const raw: RawSellbriteWarehouse = {
    uuid: 'wh-uuid-001',
    name: 'Main Warehouse',
    address_1: '100 Commerce St',
    city: 'Austin',
    state_region: 'TX',
    postal_code: '78701',
    country_code: 'US',
    archived: false,
  }

  it('maps id from uuid', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('wh-uuid-001')
  })

  it('maps externalId from uuid', () => {
    const result = transformLocation(raw)
    expect(result.externalId).toBe('wh-uuid-001')
  })

  it('maps name', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Main Warehouse')
  })

  it('code is undefined (Sellbrite has no warehouse code)', () => {
    const result = transformLocation(raw)
    expect(result.code).toBeUndefined()
  })

  it('type is warehouse', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('archived false → isActive true', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('archived true → isActive false', () => {
    const result = transformLocation({ ...raw, archived: true })
    expect(result.isActive).toBe(false)
  })

  it('archived "true" string → isActive false', () => {
    const result = transformLocation({ ...raw, archived: 'true' })
    expect(result.isActive).toBe(false)
  })

  it('maps address when address fields present', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('100 Commerce St')
    expect(result.address?.city).toBe('Austin')
    expect(result.address?.country).toBe('US')
  })

  it('address is undefined when all address fields absent', () => {
    const result = transformLocation({ uuid: 'wh-no-addr', archived: false })
    expect(result.address).toBeUndefined()
  })

  it('platform is sellbrite', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('sellbrite')
  })

  it('produces output satisfying LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
