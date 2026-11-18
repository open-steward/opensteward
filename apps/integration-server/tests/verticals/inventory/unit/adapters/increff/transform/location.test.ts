import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawIncreffLocation,
} from '../../../../../../../src/verticals/inventory/adapters/increff/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('increff transformLocation', () => {
  const raw: RawIncreffLocation = {
    warehouseCode: 'WH-MUM-01',
    name: 'Mumbai Central',
    isActive: true,
    address: {
      line1: '12 MG Road',
      city: 'Mumbai',
      state: 'Maharashtra',
      country: 'IN',
      pincode: '400001',
    },
  }

  it('maps id, externalId, and code from warehouseCode', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('WH-MUM-01')
    expect(result.externalId).toBe('WH-MUM-01')
    expect(result.code).toBe('WH-MUM-01')
  })

  it('maps name from name field', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Mumbai Central')
  })

  it('falls back name to warehouseCode when name absent', () => {
    const result = transformLocation({ warehouseCode: 'WH-DEL-01' })
    expect(result.name).toBe('WH-DEL-01')
  })

  it('maps isActive from boolean', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps address including postalCode from pincode', () => {
    const result = transformLocation(raw)
    expect(result.address?.city).toBe('Mumbai')
    expect(result.address?.region).toBe('Maharashtra')
    expect(result.address?.postalCode).toBe('400001')
  })

  it('sets type to warehouse', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('sets platform to increff', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('increff')
  })

  it('derives isActive from status when isActive absent', () => {
    const result = transformLocation({ warehouseCode: 'WH-X', status: 'inactive' })
    expect(result.isActive).toBe(false)
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
