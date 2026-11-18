import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawWebgilityLocation,
} from '../../../../../../../src/verticals/inventory/adapters/webgility/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

const rawLocation: RawWebgilityLocation = {
  locationId: 'wh-default',
  name: 'Default Warehouse',
}

describe('webgility transformLocation', () => {
  it('maps locationId to id and externalId', () => {
    const result = transformLocation(rawLocation)
    expect(result.id).toBe('wh-default')
    expect(result.externalId).toBe('wh-default')
  })

  it('maps name field to name', () => {
    const result = transformLocation(rawLocation)
    expect(result.name).toBe('Default Warehouse')
  })

  it('falls back to locationId when name is absent', () => {
    const result = transformLocation({ locationId: 'wh-default' })
    expect(result.name).toBe('wh-default')
  })

  it('sets type=warehouse', () => {
    const result = transformLocation(rawLocation)
    expect(result.type).toBe('warehouse')
  })

  it('sets isActive=true', () => {
    const result = transformLocation(rawLocation)
    expect(result.isActive).toBe(true)
  })

  it('sets platform=webgility', () => {
    const result = transformLocation(rawLocation)
    expect(result.platform).toBe('webgility')
  })

  it('produces a schema-valid Location', () => {
    const result = transformLocation(rawLocation)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
