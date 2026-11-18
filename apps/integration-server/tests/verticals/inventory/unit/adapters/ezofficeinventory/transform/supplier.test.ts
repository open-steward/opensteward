import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawEZOVendor,
} from '../../../../../../../src/verticals/inventory/adapters/ezofficeinventory/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('transformSupplier — ezofficeinventory', () => {
  const raw: RawEZOVendor = {
    id: 33,
    name: 'Acme Supplies',
    email: 'orders@acme.example',
    phone: '+14155550199',
    fax: '+14155550200',
    website: 'https://acme.example',
    address: '1 Acme Way, SF, CA 94105',
    contact_person_name: 'Jane Doe',
    description: 'Primary vendor',
    status: true,
  }
  const result = transformSupplier(raw)

  it('maps id from raw.id as string', () => {
    expect(result.id).toBe('33')
  })

  it('maps name', () => {
    expect(result.name).toBe('Acme Supplies')
  })

  it('maps email', () => {
    expect(result.email).toBe('orders@acme.example')
  })

  it('maps phone', () => {
    expect(result.phone).toBe('+14155550199')
  })

  it('maps isActive: true when status is boolean true', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets platform to ezofficeinventory', () => {
    expect(result.platform).toBe('ezofficeinventory')
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier — ezofficeinventory string status', () => {
  it('maps isActive: false when status is string "false"', () => {
    const result = transformSupplier({ id: 1, status: 'false' })
    expect(result.isActive).toBe(false)
  })

  it('maps isActive: true when status is absent', () => {
    const result = transformSupplier({ id: 1 })
    expect(result.isActive).toBe(true)
  })

  it('maps isActive: false when boolean false', () => {
    const result = transformSupplier({ id: 1, status: false })
    expect(result.isActive).toBe(false)
  })

  it('passes schema validation for inactive supplier', () => {
    const result = transformSupplier({ id: 1, name: 'Test', status: false })
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
