import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawVarioStorage,
} from '../../../../../../../src/verticals/inventory/adapters/vario-software/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

const baseRaw: RawVarioStorage = {
  id: 'stor-001',
  number: 'MAIN-WH',
  displayName: 'Main Warehouse',
  active: true,
  transit: false,
  salesStorage: true,
  purchaseOrderStorage: true,
  withStorageBins: false,
  allowNegativeStock: false,
}

describe('vario-software transformLocation', () => {
  it('maps id from id field', () => {
    expect(transformLocation(baseRaw).id).toBe('stor-001')
  })

  it('maps name from displayName', () => {
    expect(transformLocation(baseRaw).name).toBe('Main Warehouse')
  })

  it('maps code from number', () => {
    expect(transformLocation(baseRaw).code).toBe('MAIN-WH')
  })

  it('sets type to warehouse when transit is false', () => {
    expect(transformLocation(baseRaw).type).toBe('warehouse')
  })

  it('sets type to transit when transit is true', () => {
    const result = transformLocation({ ...baseRaw, transit: true })
    expect(result.type).toBe('transit')
  })

  it('maps isActive from active flag', () => {
    expect(transformLocation(baseRaw).isActive).toBe(true)
    expect(transformLocation({ ...baseRaw, active: false }).isActive).toBe(false)
  })

  it('has no address (VARIO storages have no address fields)', () => {
    expect(transformLocation(baseRaw).address).toBeUndefined()
  })

  it('sets platform to vario-software', () => {
    expect(transformLocation(baseRaw).platform).toBe('vario-software')
  })

  it('produces output that satisfies LocationSchema', () => {
    expect(() => LocationSchema.parse(transformLocation(baseRaw))).not.toThrow()
  })
})
