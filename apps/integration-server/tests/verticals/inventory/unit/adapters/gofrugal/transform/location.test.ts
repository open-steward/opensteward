import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawGofrugalLocation,
} from '../../../../../../../src/verticals/inventory/adapters/gofrugal/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('gofrugal transformLocation', () => {
  const raw: RawGofrugalLocation = {
    locationId: 42,
    locationName: 'Main Store',
  }

  it('maps id and externalId from locationId as string', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps name from locationName', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Main Store')
  })

  it('uses fallback name when locationName is absent', () => {
    const result = transformLocation({ locationId: 7 })
    expect(result.name).toBe('Location 7')
  })

  it('sets code to string locationId', () => {
    const result = transformLocation(raw)
    expect(result.code).toBe('42')
  })

  it('sets type to store', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('store')
  })

  it('sets isActive to true', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets platform to gofrugal', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('gofrugal')
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
