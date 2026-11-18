import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawPeoplevoxSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/peoplevox/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('transformSupplier — peoplevox', () => {
  const raw: RawPeoplevoxSupplier = {
    Reference: 'SUP-001',
    Name: 'Keyboards Inc',
    Email: 'orders@keyboards.example',
    Phone: '+14155550199',
    CreditLimit: '5000',
    Notes: 'Preferred supplier',
    ExternalId: 'EXT-001',
    AddressLine1: '123 Supplier St',
    AddressCity: 'London',
    AddressCountry: 'GB',
  }
  const result = transformSupplier(raw)

  it('maps id from Reference', () => {
    expect(result.id).toBe('SUP-001')
  })

  it('maps externalId from ExternalId', () => {
    expect(result.externalId).toBe('EXT-001')
  })

  it('maps name from Name', () => {
    expect(result.name).toBe('Keyboards Inc')
  })

  it('maps email from Email', () => {
    expect(result.email).toBe('orders@keyboards.example')
  })

  it('maps phone from Phone', () => {
    expect(result.phone).toBe('+14155550199')
  })

  it('hardcodes isActive to true', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets platform to peoplevox', () => {
    expect(result.platform).toBe('peoplevox')
  })

  it('stores creditLimit in metadata', () => {
    expect(result.metadata['creditLimit']).toBe('5000')
  })

  it('stores addressCity in metadata', () => {
    expect(result.metadata['addressCity']).toBe('London')
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier — peoplevox name fallbacks', () => {
  it('falls back to FirstName + LastName when Name absent', () => {
    const raw: RawPeoplevoxSupplier = {
      Reference: 'SUP-002',
      FirstName: 'John',
      LastName: 'Smith',
    }
    expect(transformSupplier(raw).name).toBe('John Smith')
  })

  it('falls back to Reference (id) when Name and FirstName/LastName absent', () => {
    const raw: RawPeoplevoxSupplier = {
      Reference: 'SUP-003',
    }
    expect(transformSupplier(raw).name).toBe('SUP-003')
  })

  it('passes schema validation for minimal input', () => {
    const raw: RawPeoplevoxSupplier = {
      Reference: 'SUP-MIN',
    }
    expect(() => SupplierSchema.parse(transformSupplier(raw))).not.toThrow()
  })
})

describe('transformSupplier — peoplevox mobile phone fallback', () => {
  it('falls back to Mobile for phone when Phone absent', () => {
    const raw: RawPeoplevoxSupplier = {
      Reference: 'SUP-004',
      Name: 'Mobile Vendor',
      Mobile: '+447700900123',
    }
    expect(transformSupplier(raw).phone).toBe('+447700900123')
  })

  it('passes schema validation', () => {
    const raw: RawPeoplevoxSupplier = {
      Reference: 'SUP-004',
      Name: 'Mobile Vendor',
      Mobile: '+447700900123',
    }
    expect(() => SupplierSchema.parse(transformSupplier(raw))).not.toThrow()
  })
})
