import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  transformVendor,
  type RilletCustomer,
  type RilletVendor,
} from '../../../../../../../src/verticals/accounting/adapters/rillet/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeCustomer(overrides: Partial<RilletCustomer> = {}): RilletCustomer {
  return {
    id: 'cust_1',
    name: 'Acme Industries',
    name_on_invoice: 'Acme Industries Inc.',
    address: {
      line1: '123 Main St',
      line2: 'Suite 400',
      city: 'San Francisco',
      state: 'CA',
      zip_code: '94105',
      country: 'US',
    },
    shipping_address: {
      line1: '456 Warehouse Rd',
      line2: '',
      city: 'Oakland',
      state: 'CA',
      zip_code: '94607',
      country: 'US',
    },
    emails: [
      { email: 'billing@acme.com', type: 'MAIN_SENDER' },
      { email: 'cc@acme.com', type: 'CC' },
    ],
    payment_terms: 30,
    send_invoices_automatically: false,
    send_payment_reminders: true,
    updated_at: '2026-02-01T14:20:00Z',
    ...overrides,
  }
}

function makeVendor(overrides: Partial<RilletVendor> = {}): RilletVendor {
  return {
    id: 'vendor_9',
    name: 'Acme Supplies LLC',
    account_code: '2000',
    address: {
      line1: '789 Vendor Blvd',
      line2: '',
      city: 'Chicago',
      state: 'IL',
      zip_code: '60601',
      country: 'US',
    },
    email: 'accounts@acme-supplies.com',
    payment_terms: 45,
    ten_ninety_nine_eligible: true,
    tax_id: 'US-987654321',
    updated_at: '2026-02-01T14:20:00Z',
    ...overrides,
  }
}

describe('transformCustomer', () => {
  it('maps id directly', () => {
    expect(transformCustomer(makeCustomer()).id).toBe('cust_1')
  })

  it('maps name', () => {
    expect(transformCustomer(makeCustomer()).name).toBe('Acme Industries')
  })

  it('sets isCustomer=true and isSupplier=false', () => {
    const c = transformCustomer(makeCustomer())
    expect(c.isCustomer).toBe(true)
    expect(c.isSupplier).toBe(false)
  })

  it('maps only MAIN_SENDER emails, typed as WORK', () => {
    const c = transformCustomer(makeCustomer())
    expect(c.emails).toHaveLength(1)
    expect(c.emails?.[0]).toEqual({ email: 'billing@acme.com', type: 'WORK' })
  })

  it('excludes CC emails from output', () => {
    const c = transformCustomer(makeCustomer())
    const ccEmails = c.emails?.filter((e) => e.email === 'cc@acme.com')
    expect(ccEmails).toHaveLength(0)
  })

  it('maps billing address fields', () => {
    const c = transformCustomer(makeCustomer())
    expect(c.billingAddress?.address1).toBe('123 Main St')
    expect(c.billingAddress?.address2).toBe('Suite 400')
    expect(c.billingAddress?.city).toBe('San Francisco')
    expect(c.billingAddress?.region).toBe('CA')
    expect(c.billingAddress?.postalCode).toBe('94105')
    expect(c.billingAddress?.country).toBe('US')
  })

  it('maps shipping address fields', () => {
    const c = transformCustomer(makeCustomer())
    expect(c.shippingAddress?.address1).toBe('456 Warehouse Rd')
    expect(c.shippingAddress?.city).toBe('Oakland')
  })

  // v4.0 Customer (https://docs.api.rillet.com/reference/list-all-customers-1.md):
  // `billing_addresses` / `shipping_addresses`, "the first is the default";
  // `address` / `shipping_address` are deprecated copies of the first entry.
  it('reads the first of the v4.0 billing_addresses and shipping_addresses', () => {
    const c = ContactSchema.parse(
      transformCustomer(
        makeCustomer({
          address: undefined,
          shipping_address: undefined,
          billing_addresses: [
            {
              id: 'addr_1',
              line1: '1 Default Way',
              city: 'Austin',
              state: 'TX',
              zip_code: '78701',
              country: 'US',
            },
            {
              id: 'addr_2',
              line1: '2 Other St',
              city: 'Dallas',
              state: 'TX',
              zip_code: '75201',
              country: 'US',
            },
          ],
          shipping_addresses: [
            {
              id: 'addr_3',
              line1: '3 Dock Rd',
              city: 'Houston',
              state: 'TX',
              zip_code: '77002',
              country: 'US',
            },
          ],
        }),
      ),
    )
    expect(c.billingAddress).toEqual({
      address1: '1 Default Way',
      city: 'Austin',
      region: 'TX',
      postalCode: '78701',
      country: 'US',
    })
    expect(c.shippingAddress?.address1).toBe('3 Dock Rd')
  })

  it('falls back to the deprecated single address when the v4.0 lists are absent', () => {
    const c = ContactSchema.parse(transformCustomer(makeCustomer({ billing_addresses: null })))
    expect(c.billingAddress?.address1).toBe('123 Main St')
  })

  it('maps updated_at to updatedAt Date', () => {
    expect(transformCustomer(makeCustomer()).updatedAt).toEqual(new Date('2026-02-01T14:20:00Z'))
  })

  it('yields undefined emails when no MAIN_SENDER present', () => {
    const c = transformCustomer(makeCustomer({ emails: [{ email: 'cc@acme.com', type: 'CC' }] }))
    expect(c.emails).toBeUndefined()
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeCustomer()
    expect(transformCustomer(raw).metadata).toBe(raw)
  })

  it('produces output that passes ContactSchema validation', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('transformVendor', () => {
  it('maps id directly', () => {
    expect(transformVendor(makeVendor()).id).toBe('vendor_9')
  })

  it('maps name', () => {
    expect(transformVendor(makeVendor()).name).toBe('Acme Supplies LLC')
  })

  it('sets isSupplier=true and isCustomer=false', () => {
    const v = transformVendor(makeVendor())
    expect(v.isSupplier).toBe(true)
    expect(v.isCustomer).toBe(false)
  })

  it('maps tax_id to taxNumber', () => {
    expect(transformVendor(makeVendor()).taxNumber).toBe('US-987654321')
  })

  it('maps email to emails array as WORK type', () => {
    const v = transformVendor(makeVendor())
    expect(v.emails).toHaveLength(1)
    expect(v.emails?.[0]).toEqual({ email: 'accounts@acme-supplies.com', type: 'WORK' })
  })

  it('yields undefined emails when email is absent', () => {
    const v = transformVendor(makeVendor({ email: undefined }))
    expect(v.emails).toBeUndefined()
  })

  it('maps billing address fields', () => {
    const v = transformVendor(makeVendor())
    expect(v.billingAddress?.address1).toBe('789 Vendor Blvd')
    expect(v.billingAddress?.city).toBe('Chicago')
    expect(v.billingAddress?.postalCode).toBe('60601')
  })

  it('maps updated_at to updatedAt Date', () => {
    expect(transformVendor(makeVendor()).updatedAt).toEqual(new Date('2026-02-01T14:20:00Z'))
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeVendor()
    expect(transformVendor(raw).metadata).toBe(raw)
  })

  it('produces output that passes ContactSchema validation', () => {
    const result = transformVendor(makeVendor())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
