import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type IntacctContact,
} from '../../../../../../../src/verticals/accounting/adapters/sageintacct/transform/contact'

function makeContact(overrides: Partial<IntacctContact> = {}): IntacctContact {
  return {
    RECORDNO: 'con-1',
    CONTACTNAME: 'johndoe',
    FIRSTNAME: 'John',
    LASTNAME: 'Doe',
    EMAIL1: 'john@example.com',
    PHONE1: '+1-555-0100',
    COMPANYNAME: 'Acme Corp',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps RECORDNO to id', () => {
    expect(transformContact(makeContact()).id).toBe('con-1')
  })

  it('builds name from FIRSTNAME and LASTNAME', () => {
    expect(transformContact(makeContact()).name).toBe('John Doe')
  })

  it('falls back to CONTACTNAME when no first/last name', () => {
    expect(
      transformContact(makeContact({ FIRSTNAME: '', LASTNAME: '' })).name,
    ).toBe('johndoe')
  })

  it('maps FIRSTNAME to firstName', () => {
    expect(transformContact(makeContact()).firstName).toBe('John')
  })

  it('maps LASTNAME to lastName', () => {
    expect(transformContact(makeContact()).lastName).toBe('Doe')
  })

  it('maps COMPANYNAME to companyName', () => {
    expect(transformContact(makeContact()).companyName).toBe('Acme Corp')
  })

  it('maps EMAIL1 to emails with WORK type', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toEqual([{ email: 'john@example.com', type: 'WORK' }])
  })

  it('omits emails array when EMAIL1 is empty', () => {
    expect(transformContact(makeContact({ EMAIL1: '' })).emails).toBeUndefined()
  })

  it('maps PHONE1 to telephones with WORK type', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toEqual([{ telephone: '+1-555-0100', type: 'WORK' }])
  })

  it('omits telephones array when PHONE1 is empty', () => {
    expect(transformContact(makeContact({ PHONE1: '' })).telephones).toBeUndefined()
  })

  it('maps MAILADDRESS to billingAddress', () => {
    const result = transformContact(
      makeContact({
        MAILADDRESS: {
          ADDRESS1: '123 Main St',
          CITY: 'Springfield',
          STATE: 'IL',
          ZIP: '62701',
          COUNTRY: 'US',
        },
      }),
    )
    expect(result.billingAddress).toEqual({
      address1: '123 Main St',
      city: 'Springfield',
      region: 'IL',
      postalCode: '62701',
      country: 'US',
    })
  })

  it('omits billingAddress when MAILADDRESS is absent', () => {
    expect(transformContact(makeContact()).billingAddress).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
