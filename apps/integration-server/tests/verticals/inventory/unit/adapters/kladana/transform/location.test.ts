import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawKladanaLocation,
} from '../../../../../../../src/verticals/inventory/adapters/kladana/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('kladana transformLocation', () => {
  const raw: RawKladanaLocation = {
    id: 'store-uuid-001',
    name: 'Main Warehouse',
    code: 'WH-MAIN',
    externalCode: 'EXT-001',
    archived: false,
    address: {
      street: '10 Tverskaya St',
      city: 'Moscow',
      region: 'Moscow Oblast',
      country: 'RU',
      postalCode: '125009',
    },
    pathName: 'Russia / Moscow',
    created: '2024-03-01T00:00:00Z',
    updated: '2024-03-01T00:00:00Z',
  }

  it('maps id from raw.id', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('store-uuid-001')
    expect(result.externalId).toBe('store-uuid-001')
  })

  it('maps name', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Main Warehouse')
  })

  it('maps code', () => {
    const result = transformLocation(raw)
    expect(result.code).toBe('WH-MAIN')
  })

  it('sets type to warehouse', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('maps address fields', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('10 Tverskaya St')
    expect(result.address?.city).toBe('Moscow')
    expect(result.address?.region).toBe('Moscow Oblast')
    expect(result.address?.country).toBe('RU')
    expect(result.address?.postalCode).toBe('125009')
  })

  it('sets isActive true when archived=false', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when archived=true', () => {
    const result = transformLocation({ ...raw, archived: true })
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when archived is missing', () => {
    const result = transformLocation({ id: 'x', archived: undefined })
    expect(result.isActive).toBe(true)
  })

  it('sets platform to kladana', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('kladana')
  })

  it('produces output that satisfies LocationSchema', () => {
    expect(() => LocationSchema.parse(transformLocation(raw))).not.toThrow()
  })
})
