import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawSellercloudWarehouse,
} from '../../../../../../../src/verticals/inventory/adapters/sellercloud/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('sellercloud transformLocation', () => {
  const raw: RawSellercloudWarehouse = {
    ID: 42,
    Name: 'East Coast Warehouse',
    IsDefault: true,
    IsSellAble: 1,
    WarehouseType: 1,
    EnforceBins: false,
    WarehouseAddress: {
      Address: '123 Shipping Lane',
      Address2: 'Suite 4',
      City: 'Newark',
      State: 'NJ',
      Country: 'US',
      ZipCode: '07101',
      Phone: '+15555550100',
      ContactName: 'Jane Smith',
    },
  }

  it('maps ID to id and externalId as string', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps Name to name', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('East Coast Warehouse')
  })

  it('maps WarehouseAddress.Address to address.line1', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('123 Shipping Lane')
  })

  it('maps WarehouseAddress.State to address.region', () => {
    const result = transformLocation(raw)
    expect(result.address?.region).toBe('NJ')
  })

  it('maps WarehouseAddress.Country to address.country', () => {
    const result = transformLocation(raw)
    expect(result.address?.country).toBe('US')
  })

  it('hardcodes isActive to true', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets platform to sellercloud', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('sellercloud')
  })

  it('falls back to Region when State is absent', () => {
    const noState: RawSellercloudWarehouse = {
      ...raw,
      WarehouseAddress: { ...raw.WarehouseAddress, State: undefined, Region: 'NY' },
    }
    const result = transformLocation(noState)
    expect(result.address?.region).toBe('NY')
  })

  it('returns undefined address when WarehouseAddress is absent', () => {
    const noAddr: RawSellercloudWarehouse = { ID: 1, Name: 'Simple' }
    const result = transformLocation(noAddr)
    expect(result.address).toBeUndefined()
  })

  it('satisfies LocationSchema', () => {
    expect(() => LocationSchema.parse(transformLocation(raw))).not.toThrow()
  })
})
