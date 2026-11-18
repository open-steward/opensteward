import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type InvoiceXpressContact } from '../../../../../../../src/verticals/accounting/adapters/invoicexpress/transform/contact'

function makeContact(overrides: Partial<InvoiceXpressContact> = {}): InvoiceXpressContact {
  return {
    id: 55,
    name: 'João Silva',
    organization_name: 'Empresa SA',
    email: 'joao@empresa.pt',
    phone: '+351912345678',
    address: 'Rua das Flores 10',
    city: 'Porto',
    postal_code: '4000-001',
    country: 'Portugal',
    tax_id: 'PT987654321',
    website: 'https://empresa.pt',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('55')
    expect(result.identification).toBe('PT987654321')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('prefers organization_name for name', () => {
    const result = transformContact(makeContact({ organization_name: 'Corp Lda' }))
    expect(result.name).toBe('Corp Lda')
  })

  it('falls back to name when organization_name is empty', () => {
    const result = transformContact(makeContact({ organization_name: '' }))
    expect(result.name).toBe('João Silva')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact({ name: 'Test Contact' })
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps email to work email', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('joao@empresa.pt')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone to work telephone', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+351912345678')
    expect(result.telephones![0].type).toBe('WORK')
  })

  it('maps billing address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('Rua das Flores 10')
    expect(result.billingAddress?.city).toBe('Porto')
    expect(result.billingAddress?.postalCode).toBe('4000-001')
    expect(result.billingAddress?.country).toBe('PT')
  })

  it('returns undefined emails when email is empty', () => {
    const result = transformContact(makeContact({ email: '' }))
    expect(result.emails).toBeUndefined()
  })

  it('returns undefined telephones when phone is empty', () => {
    const result = transformContact(makeContact({ phone: '' }))
    expect(result.telephones).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
