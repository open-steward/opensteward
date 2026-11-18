import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawBoxstormLocation,
} from '../../../../../../../src/verticals/inventory/adapters/boxstorm/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('boxstorm transformLocation', () => {
  const raw: RawBoxstormLocation = {
    id: 42,
    name: 'Main Warehouse',
    active: true,
  }

  it('maps id as string from numeric id', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps name from name field', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Main Warehouse')
  })

  it('synthesises id from name when id is absent', () => {
    const result = transformLocation({ name: 'Zone A' })
    expect(result.id).toBe('Zone A')
  })

  it('sets type to warehouse', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('sets isActive true when active is true', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when active is false', () => {
    const result = transformLocation({ ...raw, active: false })
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when active is absent', () => {
    const result = transformLocation({ id: 1, name: 'X' })
    expect(result.isActive).toBe(true)
  })

  it('sets platform to boxstorm', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('boxstorm')
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
