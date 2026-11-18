import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawDatapelLocation,
} from '../../../../../../../src/verticals/inventory/adapters/datapel/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('datapel transformLocation', () => {
  const raw: RawDatapelLocation = {
    locationsid: 42,
    description: 'Sydney Warehouse',
    cardidentification: 'SYD01',
    isinactive: false,
    isconsignment: false,
    islocked: false,
    comment: 'Main distribution centre',
    contact: 'John Smith',
    remoteid: 100,
  }

  it('maps id and externalId from locationsid', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps name from description', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Sydney Warehouse')
  })

  it('maps code from cardidentification', () => {
    const result = transformLocation(raw)
    expect(result.code).toBe('SYD01')
  })

  it('sets type to warehouse', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('sets isActive to true when isinactive is false', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive to false when isinactive is true', () => {
    const result = transformLocation({ ...raw, isinactive: true })
    expect(result.isActive).toBe(false)
  })

  it('sets isActive to false when isinactive is "1"', () => {
    const result = transformLocation({ ...raw, isinactive: '1' })
    expect(result.isActive).toBe(false)
  })

  it('sets platform to datapel', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('datapel')
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
