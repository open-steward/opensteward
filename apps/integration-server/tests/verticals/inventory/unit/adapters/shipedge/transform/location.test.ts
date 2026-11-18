import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawShipEdgeLocation,
} from '../../../../../../../src/verticals/inventory/adapters/shipedge/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('shipedge transformLocation', () => {
  const raw: RawShipEdgeLocation = {
    id: 7,
    name: 'Main DC',
  }

  it('maps id to id and externalId as string', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('7')
    expect(result.externalId).toBe('7')
  })

  it('maps name to name', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Main DC')
  })

  it('falls back to stringified id when name is absent', () => {
    const noName: RawShipEdgeLocation = { id: '42' }
    const result = transformLocation(noName)
    expect(result.name).toBe('42')
  })

  it('hardcodes isActive to true', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets type to warehouse', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('sets platform to shipedge', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('shipedge')
  })

  it('satisfies LocationSchema', () => {
    expect(() => LocationSchema.parse(transformLocation(raw))).not.toThrow()
  })
})
