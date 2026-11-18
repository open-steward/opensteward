import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type QuipuContact } from '../../../../../../../src/verticals/accounting/adapters/quipu/transform/contact'

function makeContact(overrides: Partial<QuipuContact> = {}): QuipuContact {
  return {
    id: 'con-001',
    name: 'Consultores del Norte S.L.',
    tax_id: 'B66778899',
    email: 'norte@consultores.es',
    phone: '+34 943 123 456',
    address: 'Calle Getaria 10',
    city: 'San Sebastián',
    zip_code: '20005',
    country_code: 'ES',
    region: 'País Vasco',
    is_customer: true,
    is_supplier: false,
    active: true,
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformContact (quipu)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('con-001')
    expect(result.name).toBe('Consultores del Norte S.L.')
    expect(result.identification).toBe('B66778899')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps email and phone', () => {
    const result = transformContact(makeContact())
    expect(result.emails?.[0]).toEqual({ email: 'norte@consultores.es', type: 'WORK' })
    expect(result.telephones?.[0]?.telephone).toBe('+34 943 123 456')
  })

  it('maps billing address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.city).toBe('San Sebastián')
    expect(result.billingAddress?.region).toBe('País Vasco')
  })

  it('passes raw object as metadata', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
