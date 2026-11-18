import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawEasyEcomLocation,
} from '../../../../../../../src/verticals/inventory/adapters/easyecom/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('easyecom transformLocation', () => {
  const raw: RawEasyEcomLocation = {
    warehouse_id: 42,
    warehouse_name: 'Mumbai Warehouse',
    warehouse_code: 'MUM-01',
    is_active: true,
    address_line1: '10 Industrial Area',
    address_line2: 'Phase 2',
    city: 'Mumbai',
    state: 'Maharashtra',
    country: 'IN',
    pincode: '400001',
  }

  it('maps id and externalId from warehouse_id as string', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps name from warehouse_name', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Mumbai Warehouse')
  })

  it('maps code from warehouse_code', () => {
    const result = transformLocation(raw)
    expect(result.code).toBe('MUM-01')
  })

  it('hardcodes type to warehouse', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('maps address fields', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('10 Industrial Area')
    expect(result.address?.line2).toBe('Phase 2')
    expect(result.address?.city).toBe('Mumbai')
    expect(result.address?.region).toBe('Maharashtra')
    expect(result.address?.country).toBe('IN')
    expect(result.address?.postalCode).toBe('400001')
  })

  it('omits address when address fields absent', () => {
    const result = transformLocation({
      warehouse_id: '10',
      warehouse_name: 'Empty',
    })
    expect(result.address).toBeUndefined()
  })

  it('maps isActive from is_active boolean', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when is_active is false', () => {
    const result = transformLocation({ ...raw, is_active: false })
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when absent', () => {
    const result = transformLocation({ ...raw, is_active: undefined })
    expect(result.isActive).toBe(true)
  })

  it('sets platform to easyecom', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('easyecom')
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
