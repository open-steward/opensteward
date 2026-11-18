import { describe, it, expect } from 'vitest'
import { transformLocation } from '../../../../../../../src/verticals/inventory/adapters/pickware/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('transformLocation — pickware warehouse', () => {
  const raw = {
    id: 7,
    code: 'MAIN',
    name: 'Main Warehouse',
    stockAvailableForSale: true,
    defaultWarehouse: true,
    defaultReturnShipmentWarehouse: false,
    contact: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+14155550100',
    comment: 'Primary location',
  }
  const result = transformLocation(raw)

  it('sets id from raw.id as string', () => {
    expect(result.id).toBe('7')
  })

  it('sets externalId matching id', () => {
    expect(result.externalId).toBe('7')
  })

  it('sets name from raw.name', () => {
    expect(result.name).toBe('Main Warehouse')
  })

  it('sets code from raw.code', () => {
    expect(result.code).toBe('MAIN')
  })

  it('sets type to warehouse', () => {
    expect(result.type).toBe('warehouse')
  })

  it('sets isActive to true (hardcoded)', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets platform to pickware', () => {
    expect(result.platform).toBe('pickware')
  })

  it('stores stockAvailableForSale in metadata', () => {
    expect(result.metadata['stockAvailableForSale']).toBe('true')
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('transformLocation — minimal input', () => {
  const result = transformLocation({ id: 99 })

  it('sets id to string', () => {
    expect(result.id).toBe('99')
  })

  it('sets name to empty string when missing', () => {
    expect(result.name).toBe('')
  })

  it('leaves code undefined when missing', () => {
    expect(result.code).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
