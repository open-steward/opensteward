import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type FastBillContact } from '../../../../../../../src/verticals/accounting/adapters/fastbill/transform/contact'

function makeContact(overrides: Partial<FastBillContact> = {}): FastBillContact {
  return {
    CUSTOMER_ID: 'cust-1',
    ORGANIZATION: 'Mustermann GmbH',
    FIRST_NAME: 'Max',
    LAST_NAME: 'Mustermann',
    EMAIL: 'max@mustermann.de',
    PHONE: '+49 89 123456',
    STREET: 'Musterstraße 1',
    ZIPCODE: '80331',
    CITY: 'München',
    COUNTRY_CODE: 'DE',
    VAT_ID: 'DE123456789',
    CUSTOMER_TYPE: 'business',
    ...overrides,
  }
}

describe('transformContact (FastBill)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('cust-1')
    expect(result.name).toBe('Mustermann GmbH')
    expect(result.identification).toBe('DE123456789')
  })

  it('uses individual name if no organization', () => {
    const result = transformContact(makeContact({ ORGANIZATION: '' }))
    expect(result.name).toBe('Max Mustermann')
  })

  it('maps email correctly', () => {
    const result = transformContact(makeContact())
    expect(result.emails?.[0]?.email).toBe('max@mustermann.de')
  })

  it('maps phone correctly', () => {
    const result = transformContact(makeContact())
    expect(result.telephones?.[0]?.telephone).toBe('+49 89 123456')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
