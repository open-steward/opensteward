import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  transformSupplier,
  type ReckonOneCustomer,
  type ReckonOneSupplier,
} from '../../../../../../../src/verticals/accounting/adapters/reckon-one/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeCustomer(overrides: Partial<ReckonOneCustomer> = {}): ReckonOneCustomer {
  return {
    id: 'cust_raw_001',
    name: 'Jane Smith',
    firstName: 'Jane',
    lastName: 'Smith',
    companyName: 'Smith Enterprises',
    isActive: true,
    emailAddress: 'jane@smithco.com',
    phoneNumber: '+61 2 9000 0001',
    mobile: '+61 400 000 001',
    billingAddress: {
      street: '1 George Street',
      city: 'Sydney',
      state: 'NSW',
      postCode: '2000',
      country: 'AU',
    },
    shippingAddress: {
      street: '2 Pitt Street',
      city: 'Sydney',
      state: 'NSW',
      postCode: '2000',
      country: 'AU',
    },
    currency: 'AUD',
    taxNumber: '12 345 678 901',
    createdDateTime: '2023-01-10T08:00:00Z',
    modifiedDateTime: '2024-03-01T10:00:00Z',
    ...overrides,
  }
}

function makeSupplier(overrides: Partial<ReckonOneSupplier> = {}): ReckonOneSupplier {
  return {
    id: 'supp_raw_001',
    name: 'Parts Supplier',
    firstName: 'Bob',
    lastName: 'Jones',
    companyName: 'Jones Parts Pty Ltd',
    isActive: true,
    emailAddress: 'bob@jonesparts.com',
    phoneNumber: '+61 3 9000 0001',
    billingAddress: {
      street: '5 Factory Rd',
      city: 'Melbourne',
      state: 'VIC',
      postCode: '3000',
      country: 'AU',
    },
    currency: 'AUD',
    taxNumber: '98 765 432 109',
    createdDateTime: '2023-02-01T09:00:00Z',
    modifiedDateTime: '2024-04-01T11:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer', () => {
  it('maps id with cust_ prefix', () => {
    expect(transformCustomer(makeCustomer()).id).toBe('cust_cust_raw_001')
  })

  it('maps name', () => {
    expect(transformCustomer(makeCustomer()).name).toBe('Jane Smith')
  })

  it('maps firstName', () => {
    expect(transformCustomer(makeCustomer()).firstName).toBe('Jane')
  })

  it('maps lastName', () => {
    expect(transformCustomer(makeCustomer()).lastName).toBe('Smith')
  })

  it('maps companyName', () => {
    expect(transformCustomer(makeCustomer()).companyName).toBe('Smith Enterprises')
  })

  it('maps taxNumber', () => {
    expect(transformCustomer(makeCustomer()).taxNumber).toBe('12 345 678 901')
  })

  it('sets isCustomer=true and isSupplier=false', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps isActive', () => {
    expect(transformCustomer(makeCustomer({ isActive: false })).isActive).toBe(false)
  })

  it('maps emailAddress to emails with WORK type', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.emails?.[0].email).toBe('jane@smithco.com')
    expect(result.emails?.[0].type).toBe('WORK')
  })

  it('maps phoneNumber to WORK telephone and mobile to MOBILE telephone', () => {
    const result = transformCustomer(makeCustomer())
    const types = result.telephones?.map((t) => t.type)
    expect(types).toContain('WORK')
    expect(types).toContain('MOBILE')
  })

  it('maps billingAddress', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.billingAddress?.address1).toBe('1 George Street')
    expect(result.billingAddress?.city).toBe('Sydney')
    expect(result.billingAddress?.country).toBe('AU')
  })

  it('maps shippingAddress', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.shippingAddress?.address1).toBe('2 Pitt Street')
  })

  it('maps createdDateTime to createdAt', () => {
    expect(transformCustomer(makeCustomer()).createdAt).toEqual(new Date('2023-01-10T08:00:00Z'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeCustomer()
    expect(transformCustomer(raw).metadata).toBe(raw)
  })

  it('produces output that passes ContactSchema validation', () => {
    expect(() => ContactSchema.parse(transformCustomer(makeCustomer()))).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformCustomer({ id: 'c001' })
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier', () => {
  it('maps id with supp_ prefix', () => {
    expect(transformSupplier(makeSupplier()).id).toBe('supp_supp_raw_001')
  })

  it('sets isCustomer=false and isSupplier=true', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('does not include shippingAddress', () => {
    expect(transformSupplier(makeSupplier()).shippingAddress).toBeUndefined()
  })

  it('maps taxNumber', () => {
    expect(transformSupplier(makeSupplier()).taxNumber).toBe('98 765 432 109')
  })

  it('produces output that passes ContactSchema validation', () => {
    expect(() => ContactSchema.parse(transformSupplier(makeSupplier()))).not.toThrow()
  })
})
