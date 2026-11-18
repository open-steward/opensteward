import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawInforWmsLocation,
} from '../../../../../../../src/verticals/inventory/adapters/infor-wms/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('infor-wms transformLocation', () => {
  const raw: RawInforWmsLocation = {
    warehouseId: 'WH-001',
    warehouseName: 'Chicago DC',
    facilityCode: 'CHI-DC',
    activeFlag: 'Y',
    locationType: 'WAREHOUSE',
    address1: '100 Industrial Blvd',
    city: 'Chicago',
    stateCode: 'IL',
    countryCode: 'US',
    postalCode: '60601',
    companyCode: 'CORP',
  }

  it('maps id and externalId from warehouseId', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('WH-001')
    expect(result.externalId).toBe('WH-001')
  })

  it('maps name from warehouseName', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Chicago DC')
  })

  it('maps code from facilityCode', () => {
    const result = transformLocation(raw)
    expect(result.code).toBe('CHI-DC')
  })

  it('maps locationType WAREHOUSE to warehouse', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('maps locationType BIN to bin', () => {
    const result = transformLocation({ ...raw, locationType: 'BIN' })
    expect(result.type).toBe('bin')
  })

  it('maps locationType ZONE to zone', () => {
    const result = transformLocation({ ...raw, locationType: 'ZONE' })
    expect(result.type).toBe('zone')
  })

  it('maps isActive from activeFlag Y', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps isActive false from activeFlag N', () => {
    const result = transformLocation({ ...raw, activeFlag: 'N' })
    expect(result.isActive).toBe(false)
  })

  it('maps address fields', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('100 Industrial Blvd')
    expect(result.address?.city).toBe('Chicago')
    expect(result.address?.region).toBe('IL')
    expect(result.address?.country).toBe('US')
    expect(result.address?.postalCode).toBe('60601')
  })

  it('sets platform to infor-wms', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('infor-wms')
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
