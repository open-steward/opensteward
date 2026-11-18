import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawBillbeeLocation,
} from '../../../../../../../src/verticals/inventory/adapters/billbee/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('billbee transformLocation', () => {
  const raw: RawBillbeeLocation = {
    Id: 7,
    Name: 'Hauptlager',
    Description: 'Main warehouse in Berlin',
    IsDefault: true,
  }

  it('maps id as string from Id', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('7')
    expect(result.externalId).toBe('7')
  })

  it('maps name from Name', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Hauptlager')
  })

  it('sets type to warehouse', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('sets isActive to true', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets platform to billbee', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('billbee')
  })

  it('handles missing name gracefully', () => {
    const result = transformLocation({ Id: 8 })
    expect(result.name).toBe('')
    expect(result.id).toBe('8')
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
