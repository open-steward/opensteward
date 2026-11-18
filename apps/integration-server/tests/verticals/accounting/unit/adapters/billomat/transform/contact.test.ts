import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type BillomatContact,
} from '../../../../../../../src/verticals/accounting/adapters/billomat/transform/contact'

function makeContact(overrides: Partial<BillomatContact> = {}): BillomatContact {
  return {
    id: 'contact-1',
    name: 'Max Mustermann',
    company_name: 'Mustermann GmbH',
    email: 'max@mustermann.de',
    phone: '+49 30 12345678',
    fax: '+49 30 87654321',
    street: 'Berliner Str. 10',
    city: 'Berlin',
    state: 'Berlin',
    zip: '10115',
    country_code: 'DE',
    tax_number: '27/123/45678',
    vat_number: 'DE123456789',
    is_customer: true,
    is_supplier: false,
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id from raw id', () => {
    expect(transformContact(makeContact()).id).toBe('contact-1')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('Max Mustermann')
  })

  it('maps company_name to companyName', () => {
    expect(transformContact(makeContact()).companyName).toBe('Mustermann GmbH')
  })

  it('maps vat_number to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('DE123456789')
  })

  it('falls back to tax_number when vat_number is empty', () => {
    expect(transformContact(makeContact({ vat_number: '' })).taxNumber).toBe('27/123/45678')
  })

  it('maps is_customer to isCustomer', () => {
    expect(transformContact(makeContact({ is_customer: true })).isCustomer).toBe(true)
    expect(transformContact(makeContact({ is_customer: false })).isCustomer).toBe(false)
  })

  it('maps is_supplier to isSupplier', () => {
    expect(transformContact(makeContact({ is_supplier: true })).isSupplier).toBe(true)
    expect(transformContact(makeContact({ is_supplier: false })).isSupplier).toBe(false)
  })

  it('sets isActive to true', () => {
    expect(transformContact(makeContact()).isActive).toBe(true)
  })

  it('maps email to emails', () => {
    const c = transformContact(makeContact())
    expect(c.emails?.[0]).toEqual({ email: 'max@mustermann.de', type: 'WORK' })
  })

  it('maps phone and fax to telephones', () => {
    const c = transformContact(makeContact())
    expect(c.telephones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ telephone: '+49 30 12345678', type: 'WORK' }),
        expect.objectContaining({ telephone: '+49 30 87654321', type: 'FAX' }),
      ]),
    )
  })

  it('maps billing address fields', () => {
    const c = transformContact(makeContact())
    expect(c.billingAddress?.address1).toBe('Berliner Str. 10')
    expect(c.billingAddress?.city).toBe('Berlin')
    expect(c.billingAddress?.region).toBe('Berlin')
    expect(c.billingAddress?.postalCode).toBe('10115')
    expect(c.billingAddress?.country).toBe('DE')
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
