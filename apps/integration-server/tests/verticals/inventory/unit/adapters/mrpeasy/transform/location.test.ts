import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawMrpeasyLocation,
} from '../../../../../../../src/verticals/inventory/adapters/mrpeasy/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('mrpeasy transformLocation', () => {
  const raw: RawMrpeasyLocation = {
    site_id: 3,
    site_title: 'Main Warehouse',
    site_code: 'MW',
  }

  it('maps id and externalId from site_id as string', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('3')
    expect(result.externalId).toBe('3')
  })

  it('maps name from site_title', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Main Warehouse')
  })

  it('falls back to id as name when site_title is undefined', () => {
    const result = transformLocation({ site_id: 4 })
    expect(result.name).toBe('4')
  })

  it('maps code from site_code', () => {
    const result = transformLocation(raw)
    expect(result.code).toBe('MW')
  })

  it('sets type to warehouse', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('sets isActive to true', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets platform to mrpeasy', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('mrpeasy')
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
