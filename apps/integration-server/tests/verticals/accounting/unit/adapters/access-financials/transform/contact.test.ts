/**
 * Customer and supplier records → Contact.
 *
 * The fixtures carry the fields the documented list queries select
 * (`customerDetails { primaryKey code name onStop contactDetails { title
 * firstName surname jobTitle ... } addressDetails { address town county
 * country postCode email telephone mobile ... } }`, and `supplierDetails`
 * alike) on
 * https://developer.erp.accessacloud.com/docs/financials/business-entities/records/customer
 * and .../records/supplier. Those pages show no response, so the values are
 * illustrative; the codes and names are the ones the selling and purchasing
 * examples answer with.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  transformSupplier,
} from '../../../../../../../src/verticals/accounting/adapters/access-financials/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { recordDetails } from '../fixtures'

describe('transformCustomer (access-financials)', () => {
  it('parses as a canonical Contact', () => {
    expect(() =>
      ContactSchema.parse(transformCustomer({ customerDetails: recordDetails() })),
    ).not.toThrow()
  })

  it('takes its id from the customer code, the code invoices carry as accountCode', () => {
    const c = transformCustomer({ customerDetails: recordDetails() })
    expect(c.id).toBe('cust_GB-12686')
    expect(c.isCustomer).toBe(true)
    expect(c.isSupplier).toBe(false)
  })

  it('maps name, contact person, email, phones and address', () => {
    const c = transformCustomer({ customerDetails: recordDetails() })
    expect(c.name).toBe('In At Pede Industries')
    expect(c.firstName).toBe('Jane')
    expect(c.lastName).toBe('Doe')
    expect(c.emails).toEqual([{ email: 'accounts@inatpede.example', type: 'WORK' }])
    expect(c.telephones).toEqual([
      { telephone: '01332 000000', type: 'WORK' },
      { telephone: '07700 900000', type: 'MOBILE' },
    ])
    expect(c.billingAddress).toEqual({
      address1: '1 High Street',
      address2: undefined,
      city: 'Derby',
      region: 'Derbyshire',
      postalCode: 'DE1 1AA',
      country: undefined,
    })
  })

  it('does not read onStop (credit hold) as inactive', () => {
    expect(
      transformCustomer({ customerDetails: recordDetails({ onStop: true }) }).isActive,
    ).toBeUndefined()
  })

  it('leaves out absent contact and address details', () => {
    const c = ContactSchema.parse(
      transformCustomer({
        customerDetails: recordDetails({ contactDetails: null, addressDetails: null }),
      }),
    )
    expect(c.emails).toBeUndefined()
    expect(c.telephones).toBeUndefined()
    expect(c.billingAddress).toBeUndefined()
  })

  it('throws on a record with no code rather than inventing an id', () => {
    expect(() => transformCustomer({ customerDetails: recordDetails({ code: null }) })).toThrow(
      /no code/,
    )
  })
})

describe('transformSupplier (access-financials)', () => {
  const supplier = () =>
    transformSupplier({
      supplierDetails: recordDetails({
        primaryKey: 1225,
        code: 'GB-S-1225',
        name: 'Hendrerit Industries',
      }),
    })

  it('parses as a canonical Contact', () => {
    expect(() => ContactSchema.parse(supplier())).not.toThrow()
  })

  it('takes its id from the supplier code, the code bills carry as accountCode', () => {
    const s = supplier()
    expect(s.id).toBe('supp_GB-S-1225')
    expect(s.isSupplier).toBe(true)
    expect(s.isCustomer).toBe(false)
    expect(s.name).toBe('Hendrerit Industries')
  })
})
