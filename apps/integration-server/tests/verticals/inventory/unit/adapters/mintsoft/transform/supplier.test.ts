import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawMintsoftSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/mintsoft/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('mintsoft transformSupplier', () => {
  const raw: RawMintsoftSupplier = {
    ID: 99,
    Name: 'Acme Supplies Ltd',
    ContactName: 'Jane Smith',
    ContactEmail: 'jane@acme.example.com',
    ContactNumber: '+44 20 1234 5678',
    AddressLine1: '10 Industrial Park',
    Town: 'Manchester',
    Postcode: 'M1 2AB',
    Active: true,
    CurrencyId: 1,
    ClientId: 10,
  }

  it('maps id and externalId from ID as string', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('99')
    expect(result.externalId).toBe('99')
  })

  it('maps name from Name field', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Acme Supplies Ltd')
  })

  it('maps email from ContactEmail', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('jane@acme.example.com')
  })

  it('maps phone from ContactNumber', () => {
    const result = transformSupplier(raw)
    expect(result.phone).toBe('+44 20 1234 5678')
  })

  it('maps isActive from Active field', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when Active is false', () => {
    const result = transformSupplier({ ...raw, Active: false })
    expect(result.isActive).toBe(false)
  })

  it('sets platform to mintsoft', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('mintsoft')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
