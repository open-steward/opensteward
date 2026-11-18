import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawCheqroomLocation,
} from '../../../../../../../src/verticals/inventory/adapters/cheqroom/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('cheqroom transformLocation', () => {
  it('maps _id to id and externalId', () => {
    const raw: RawCheqroomLocation = {
      _id: 'loc_abc123',
      name: 'Main Depot',
    }
    const result = transformLocation(raw)

    expect(result.id).toBe('loc_abc123')
    expect(result.externalId).toBe('loc_abc123')
  })

  it('maps name and sets type to warehouse', () => {
    const raw: RawCheqroomLocation = {
      _id: 'loc_xyz',
      name: 'Equipment Room',
    }
    const result = transformLocation(raw)

    expect(result.name).toBe('Equipment Room')
    expect(result.type).toBe('warehouse')
  })

  it('is always active regardless of any fields', () => {
    const raw: RawCheqroomLocation = { _id: 'loc_1' }
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('stores free-text address in metadata, not in canonical address field', () => {
    const raw: RawCheqroomLocation = {
      _id: 'loc_2',
      name: 'Warehouse B',
      address: '456 Elm St, Springfield',
    }
    const result = transformLocation(raw)

    expect(result.address).toBeUndefined()
    expect(result.metadata['address']).toBe('456 Elm St, Springfield')
  })

  it('sets platform to cheqroom', () => {
    const raw: RawCheqroomLocation = { _id: 'loc_3' }
    const result = transformLocation(raw)
    expect(result.platform).toBe('cheqroom')
  })

  it('defaults name to empty string when absent', () => {
    const raw: RawCheqroomLocation = { _id: 'loc_4' }
    const result = transformLocation(raw)
    expect(result.name).toBe('')
  })

  it('passes LocationSchema validation', () => {
    const raw: RawCheqroomLocation = {
      _id: 'loc_full',
      name: 'Full Location',
      address: '1 Main Street, Anytown, CA',
    }
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
