import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawStockTrimLocation,
} from '../../../../../../../src/verticals/inventory/adapters/stocktrim/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('transformLocation — stocktrim', () => {
  const raw: RawStockTrimLocation = {
    locationCode: 'WH-SFO',
    locationName: 'SF Warehouse',
    externalId: 'EXT-LOC-01',
  }
  const result = transformLocation(raw)

  it('maps id from locationCode', () => {
    expect(result.id).toBe('WH-SFO')
  })

  it('maps externalId from externalId when provided', () => {
    expect(result.externalId).toBe('EXT-LOC-01')
  })

  it('maps name from locationName', () => {
    expect(result.name).toBe('SF Warehouse')
  })

  it('maps code from locationCode', () => {
    expect(result.code).toBe('WH-SFO')
  })

  it('sets type to warehouse', () => {
    expect(result.type).toBe('warehouse')
  })

  it('sets isActive to true', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets platform to stocktrim', () => {
    expect(result.platform).toBe('stocktrim')
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('transformLocation — stocktrim no externalId', () => {
  const raw: RawStockTrimLocation = {
    locationCode: 'WH-NYC',
    locationName: 'NYC Warehouse',
  }
  const result = transformLocation(raw)

  it('falls back externalId to locationCode when externalId absent', () => {
    expect(result.externalId).toBe('WH-NYC')
  })

  it('falls back name to locationCode when locationName absent', () => {
    const noName = transformLocation({ locationCode: 'WH-BARE' })
    expect(noName.name).toBe('WH-BARE')
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
