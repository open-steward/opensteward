import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawMarketmanLocation,
} from '../../../../../../../src/verticals/inventory/adapters/marketman/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('marketman transformLocation', () => {
  const raw: RawMarketmanLocation = {
    ID: 'storage-001',
    Name: 'Walk-in Cooler',
    BuyerGuid: 'buyer-guid-abc',
  }

  it('maps id and externalId from ID', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('storage-001')
    expect(result.externalId).toBe('storage-001')
  })

  it('maps name from Name field', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Walk-in Cooler')
  })

  it('falls back to ID as name when Name is undefined', () => {
    const result = transformLocation({ ID: 'storage-002' })
    expect(result.name).toBe('storage-002')
  })

  it('sets type to unknown (MarketMan has no location-type concept)', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('unknown')
  })

  it('sets isActive to true', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets platform to marketman', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('marketman')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
