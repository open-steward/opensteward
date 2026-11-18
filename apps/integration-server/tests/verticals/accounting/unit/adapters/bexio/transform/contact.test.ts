import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type BexioContact,
} from '../../../../../../../src/verticals/accounting/adapters/bexio/transform/contact'

function makeContact(overrides: Partial<BexioContact> = {}): BexioContact {
  return {
    id: 301,
    nr: 'C-001',
    contact_type_id: 1,
    name_1: 'Acme AG',
    name_2: '',
    mail: 'info@acme.ch',
    phone_fixed: '+41 44 123 45 67',
    phone_mobile: '+41 79 123 45 67',
    fax: '',
    address: 'Bahnhofstrasse 1',
    postcode: '8001',
    city: 'Zurich',
    country_id: 1,
    country_code: 'CH',
    is_lead: false,
    updated_at: '2024-06-01T10:00:00+0200',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id as string', () => {
    expect(transformContact(makeContact()).id).toBe('301')
  })

  it('maps name_1 to name', () => {
    expect(transformContact(makeContact()).name).toBe('Acme AG')
  })

  it('sets companyName for company contacts (contact_type_id=1)', () => {
    expect(transformContact(makeContact({ contact_type_id: 1 })).companyName).toBe('Acme AG')
  })

  it('sets firstName for person contacts (contact_type_id=2)', () => {
    const result = transformContact(
      makeContact({ contact_type_id: 2, name_1: 'Hans', name_2: 'Muster' }),
    )
    expect(result.firstName).toBe('Hans')
    expect(result.lastName).toBe('Muster')
    expect(result.companyName).toBeUndefined()
  })

  it('maps mail to emails array', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toEqual([{ email: 'info@acme.ch', type: 'WORK' }])
  })

  it('returns undefined emails when mail is empty', () => {
    expect(transformContact(makeContact({ mail: '' })).emails).toBeUndefined()
  })

  it('maps phone_fixed to telephones', () => {
    const result = transformContact(makeContact({ phone_mobile: '', fax: '' }))
    expect(result.telephones).toEqual([
      { telephone: '+41 44 123 45 67', type: 'WORK' },
    ])
  })

  it('includes mobile phone in telephones', () => {
    const result = transformContact(makeContact({ fax: '' }))
    expect(result.telephones).toEqual([
      { telephone: '+41 44 123 45 67', type: 'WORK' },
      { telephone: '+41 79 123 45 67', type: 'MOBILE' },
    ])
  })

  it('returns undefined telephones when no phone numbers', () => {
    expect(
      transformContact(makeContact({ phone_fixed: '', phone_mobile: '', fax: '' })).telephones,
    ).toBeUndefined()
  })

  it('maps address fields to billingAddress', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress).toEqual({
      address1: 'Bahnhofstrasse 1',
      city: 'Zurich',
      postalCode: '8001',
      country: 'CH',
    })
  })

  it('returns undefined billingAddress when all address fields are empty', () => {
    expect(
      transformContact(
        makeContact({ address: '', postcode: '', city: '', country_code: '' }),
      ).billingAddress,
    ).toBeUndefined()
  })

  it('maps updated_at to updatedAt as Date', () => {
    const result = transformContact(makeContact())
    expect(result.updatedAt).toEqual(new Date('2024-06-01T10:00:00+0200'))
  })

  it('returns undefined updatedAt when updated_at is empty', () => {
    expect(transformContact(makeContact({ updated_at: '' })).updatedAt).toBeUndefined()
  })

  it('sets isCustomer to true', () => {
    expect(transformContact(makeContact()).isCustomer).toBe(true)
  })

  it('sets isActive to true', () => {
    expect(transformContact(makeContact()).isActive).toBe(true)
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
