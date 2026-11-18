import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawShelfNuLocation,
} from '../../../../../../../src/verticals/inventory/adapters/shelf-nu/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('shelf-nu transformLocation', () => {
  const raw: RawShelfNuLocation = {
    id: 'loc-abc123',
    name: 'Cabinet A',
    description: 'Top-left cabinet in storage room',
    address: '12 Warehouse Road, Springfield',
    latitude: 37.7749,
    longitude: -122.4194,
    parentId: 'loc-parent01',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-06-01T00:00:00Z',
  }

  it('maps id to id and externalId', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('loc-abc123')
    expect(result.externalId).toBe('loc-abc123')
  })

  it('maps name to name', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Cabinet A')
  })

  it('maps address string to address.line1', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('12 Warehouse Road, Springfield')
  })

  it('maps parentId to parentLocationId', () => {
    const result = transformLocation(raw)
    expect(result.parentLocationId).toBe('loc-parent01')
  })

  it('hardcodes isActive to true', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets platform to shelf-nu', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('shelf-nu')
  })

  it('returns undefined address when address is absent', () => {
    const noAddr: RawShelfNuLocation = { id: 'x', name: 'X', address: null }
    const result = transformLocation(noAddr)
    expect(result.address).toBeUndefined()
  })

  it('returns undefined parentLocationId when parentId is null', () => {
    const noParent: RawShelfNuLocation = { ...raw, parentId: null }
    const result = transformLocation(noParent)
    expect(result.parentLocationId).toBeUndefined()
  })

  it('satisfies LocationSchema', () => {
    expect(() => LocationSchema.parse(transformLocation(raw))).not.toThrow()
  })
})
