import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type FacturamaContact } from '../../../../../../../src/verticals/accounting/adapters/facturama/transform/contact'

function makeRaw(overrides: Partial<FacturamaContact> = {}): FacturamaContact {
  return {
    Id: 'cust-1',
    Name: 'Test Customer',
    Rfc: 'TEST010101XYZ',
    Email: 'test@example.mx',
    Phone: '5551234567',
    Address: {
      Street: 'Reforma',
      ExteriorNumber: '1',
      InteriorNumber: '',
      Neighborhood: 'Colonia',
      ZipCode: '06600',
      Municipality: 'CDMX',
      State: 'CDMX',
      Country: 'MX',
    },
    IsActive: true,
    CurrencyCode: 'MXN',
    ...overrides,
  }
}

describe('facturama transformContact', () => {
  it('maps Id to id', () => {
    expect(transformContact(makeRaw()).id).toBe('cust-1')
  })
  it('handles fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })
  it('sets isCustomer true and isSupplier false', () => {
    const result = transformContact(makeRaw())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })
  it('maps Rfc to identification', () => {
    expect(transformContact(makeRaw()).identification).toBe('TEST010101XYZ')
  })
  it('maps IsActive', () => {
    expect(transformContact(makeRaw({ IsActive: false })).isActive).toBe(false)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
