import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type FlowAccountContact } from '../../../../../../../src/verticals/accounting/adapters/flowaccount/transform/contact'

function makeContact(overrides: Partial<FlowAccountContact> = {}): FlowAccountContact {
  return {
    id: 200,
    contactCode: 'CUST-001',
    contactName: 'Somchai Co., Ltd.',
    contactType: '1',
    email: 'contact@somchai.co.th',
    phone: '+66 2 222 3333',
    address: '55 Rama IV Rd',
    province: 'Bangkok',
    postCode: '10110',
    countryNameEN: 'Thailand',
    taxId: '0105566012345',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('200')
    expect(result.name).toBe('Somchai Co., Ltd.')
    expect(result.identification).toBe('0105566012345')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps contactType 1 (customer) correctly', () => {
    const result = transformContact(makeContact({ contactType: '1' }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps contactType 2 (supplier) correctly', () => {
    const result = transformContact(makeContact({ contactType: '2' }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps contactType 3 (both) correctly', () => {
    const result = transformContact(makeContact({ contactType: '3' }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(true)
  })

  it('maps email to work email', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('contact@somchai.co.th')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone to work telephone', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+66 2 222 3333')
  })

  it('maps billing address fields', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('55 Rama IV Rd')
    expect(result.billingAddress?.region).toBe('Bangkok')
    expect(result.billingAddress?.postalCode).toBe('10110')
    expect(result.billingAddress?.country).toBe('TH')
  })

  it('returns undefined emails when email is empty', () => {
    const result = transformContact(makeContact({ email: '' }))
    expect(result.emails).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
