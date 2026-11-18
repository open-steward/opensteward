import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawEccangLocation,
} from '../../../../../../../src/verticals/inventory/adapters/eccang/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('eccang transformLocation', () => {
  const raw: RawEccangLocation = {
    warehouse_id: 101,
    warehouse_code: 'SZ-MAIN',
    warehouse_name: 'Shenzhen Main Warehouse',
    warehouse_type: 'normal',
    is_enabled: true,
    is_default: true,
    country: 'CN',
    province: 'Guangdong',
    city: 'Shenzhen',
    address: '88 Commerce Road',
    zip_code: '518000',
    contact: 'Zhang Wei',
    phone: '+8675512345678',
  }

  it('maps id and externalId from warehouse_id as string', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('101')
    expect(result.externalId).toBe('101')
  })

  it('maps name from warehouse_name', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Shenzhen Main Warehouse')
  })

  it('maps code from warehouse_code', () => {
    const result = transformLocation(raw)
    expect(result.code).toBe('SZ-MAIN')
  })

  it('hardcodes type to warehouse', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('maps address fields', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('88 Commerce Road')
    expect(result.address?.city).toBe('Shenzhen')
    expect(result.address?.region).toBe('Guangdong')
    expect(result.address?.country).toBe('CN')
    expect(result.address?.postalCode).toBe('518000')
  })

  it('omits address when address, city, and country are all absent', () => {
    const result = transformLocation({
      warehouse_id: 102,
      warehouse_name: 'Virtual',
    })
    expect(result.address).toBeUndefined()
  })

  it('maps isActive from is_enabled', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when is_enabled is false', () => {
    const result = transformLocation({ ...raw, is_enabled: false })
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when is_enabled absent', () => {
    const result = transformLocation({ ...raw, is_enabled: undefined })
    expect(result.isActive).toBe(true)
  })

  it('stores warehouseType and contact in metadata', () => {
    const result = transformLocation(raw)
    expect(result.metadata.warehouseType).toBe('normal')
    expect(result.metadata.contact).toBe('Zhang Wei')
  })

  it('sets platform to eccang', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('eccang')
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
