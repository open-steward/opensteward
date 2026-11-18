import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawIqmetrixSupplierEntity,
} from '../../../../../../../src/verticals/inventory/adapters/iqmetrix/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('transformSupplier — iqmetrix entity', () => {
  const raw: RawIqmetrixSupplierEntity = {
    Id: 999,
    Name: 'Vendor A',
    DisplayName: 'Vendor A Display',
    Description: 'Electronics distributor',
    CreatedUtc: '2024-03-01T00:00:00Z',
    LastModifiedUtc: '2024-03-01T00:00:00Z',
  }
  const result = transformSupplier(raw)

  it('sets id from Id', () => {
    expect(result.id).toBe('999')
  })

  it('sets name from Name', () => {
    expect(result.name).toBe('Vendor A')
  })

  it('sets isActive to true', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets platform to iqmetrix', () => {
    expect(result.platform).toBe('iqmetrix')
  })

  it('email is undefined', () => {
    expect(result.email).toBeUndefined()
  })

  it('defaultCurrency is undefined', () => {
    expect(result.defaultCurrency).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier — string Id', () => {
  const raw: RawIqmetrixSupplierEntity = {
    Id: 'sup-str-001',
    Name: 'String ID Supplier',
  }
  const result = transformSupplier(raw)

  it('sets id as string from string Id', () => {
    expect(result.id).toBe('sup-str-001')
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
