import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawJushuitanLocation,
} from '../../../../../../../src/verticals/inventory/adapters/jushuitan/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('jushuitan transformLocation', () => {
  const raw: RawJushuitanLocation = {
    wms_co_id: 42,
    wms_name: 'Shanghai Warehouse',
    short_name: 'SHA',
    enabled: 1,
    province: 'Shanghai',
    city: 'Shanghai',
    county: 'Pudong',
    address: '123 Logistics Road',
  }

  it('maps id from wms_co_id', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps name from wms_name', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Shanghai Warehouse')
  })

  it('maps code from short_name', () => {
    const result = transformLocation(raw)
    expect(result.code).toBe('SHA')
  })

  it('sets type to warehouse', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('maps address with country CN', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('123 Logistics Road')
    expect(result.address?.city).toBe('Shanghai')
    expect(result.address?.region).toBe('Shanghai')
    expect(result.address?.country).toBe('CN')
  })

  it('sets isActive true when enabled=1', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('defaults isActive to true when enabled is missing', () => {
    const result = transformLocation({ wms_co_id: 1 })
    expect(result.isActive).toBe(true)
  })

  it('sets platform to jushuitan', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('jushuitan')
  })

  it('produces output that satisfies LocationSchema', () => {
    expect(() => LocationSchema.parse(transformLocation(raw))).not.toThrow()
  })

  it('handles numeric string wms_co_id', () => {
    const result = transformLocation({ ...raw, wms_co_id: '99' })
    expect(result.id).toBe('99')
  })
})
