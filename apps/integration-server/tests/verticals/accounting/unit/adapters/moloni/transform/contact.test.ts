import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type MoloniContact } from '../../../../../../../src/verticals/accounting/adapters/moloni/transform/contact'

function makeContact(overrides: Partial<MoloniContact> = {}): MoloniContact {
  return {
    customer_id: 42,
    name: 'Empresa Lda',
    vat: 'PT123456789',
    email: 'info@empresa.pt',
    phone: '+351210000000',
    address: 'Rua da Liberdade 1',
    city: 'Lisboa',
    zip_code: '1000-001',
    country_id: 1,
    is_customer: 1,
    is_supplier: 0,
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('42')
    expect(result.name).toBe('Empresa Lda')
    expect(result.identification).toBe('PT123456789')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact({ name: 'Test Corp' })
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps email to work email', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('info@empresa.pt')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone to work telephone', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+351210000000')
    expect(result.telephones![0].type).toBe('WORK')
  })

  it('maps billing address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('Rua da Liberdade 1')
    expect(result.billingAddress?.city).toBe('Lisboa')
    expect(result.billingAddress?.postalCode).toBe('1000-001')
  })

  it('returns undefined emails when email is empty', () => {
    const result = transformContact(makeContact({ email: '' }))
    expect(result.emails).toBeUndefined()
  })

  it('returns undefined telephones when phone is empty', () => {
    const result = transformContact(makeContact({ phone: '' }))
    expect(result.telephones).toBeUndefined()
  })

  it('maps is_supplier flag correctly', () => {
    const result = transformContact(makeContact({ is_supplier: 1 }))
    expect(result.isSupplier).toBe(true)
  })

  it('maps is_customer 0 to false', () => {
    const result = transformContact(makeContact({ is_customer: 0 }))
    expect(result.isCustomer).toBe(false)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
