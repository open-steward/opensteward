import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type FreeAgentContact,
} from '../../../../../../../src/verticals/accounting/adapters/freeagent/transform/contact'

function makeContact(overrides: Partial<FreeAgentContact> = {}): FreeAgentContact {
  return {
    url: 'https://api.freeagent.com/v2/contacts/5678',
    organisation_name: 'Acme Ltd',
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane@acme.com',
    phone_number: '+441234567890',
    mobile: '+447777888999',
    billing_email: 'billing@acme.com',
    is_active: true,
    account_balance: '0.00',
    status: 'Active',
    address1: '10 High Street',
    address2: 'Floor 2',
    town: 'London',
    region: 'England',
    postcode: 'EC1A 1BB',
    country: 'United Kingdom',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('extracts id from url', () => {
    expect(transformContact(makeContact()).id).toBe('5678')
  })

  it('uses organisation_name as name when present', () => {
    expect(transformContact(makeContact()).name).toBe('Acme Ltd')
  })

  it('falls back to first + last name when no organisation_name', () => {
    const c = transformContact(makeContact({ organisation_name: '' }))
    expect(c.name).toBe('Jane Doe')
  })

  it('maps firstName and lastName', () => {
    const c = transformContact(makeContact())
    expect(c.firstName).toBe('Jane')
    expect(c.lastName).toBe('Doe')
  })

  it('maps companyName from organisation_name', () => {
    expect(transformContact(makeContact()).companyName).toBe('Acme Ltd')
  })

  it('sets isCustomer true and isSupplier false', () => {
    const c = transformContact(makeContact())
    expect(c.isCustomer).toBe(true)
    expect(c.isSupplier).toBe(false)
  })

  it('maps Active status to isActive true', () => {
    expect(transformContact(makeContact({ status: 'Active' })).isActive).toBe(true)
  })

  it('maps Inactive status to isActive false', () => {
    expect(transformContact(makeContact({ status: 'Inactive' })).isActive).toBe(false)
  })

  it('maps email and billing_email into emails array', () => {
    const c = transformContact(makeContact())
    expect(c.emails).toHaveLength(2)
    expect(c.emails![0].email).toBe('jane@acme.com')
    expect(c.emails![1].email).toBe('billing@acme.com')
  })

  it('deduplicates billing_email when same as email', () => {
    const c = transformContact(makeContact({ billing_email: 'jane@acme.com' }))
    expect(c.emails).toHaveLength(1)
  })

  it('maps phone_number and mobile to telephones', () => {
    const c = transformContact(makeContact())
    expect(c.telephones).toHaveLength(2)
    expect(c.telephones![0].telephone).toBe('+441234567890')
    expect(c.telephones![0].type).toBe('WORK')
    expect(c.telephones![1].telephone).toBe('+447777888999')
    expect(c.telephones![1].type).toBe('MOBILE')
  })

  it('maps billing address fields', () => {
    const c = transformContact(makeContact())
    expect(c.billingAddress?.address1).toBe('10 High Street')
    expect(c.billingAddress?.city).toBe('London')
    expect(c.billingAddress?.postalCode).toBe('EC1A 1BB')
    expect(c.billingAddress?.country).toBe('GB')
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
