import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  transformVendor,
  type MezanCustomer,
  type MezanVendor,
} from '../../../../../../../src/verticals/accounting/adapters/mezan/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeCustomer(overrides: Partial<MezanCustomer> = {}): MezanCustomer {
  return {
    id: 'cust_001',
    name: 'Jane Doe',
    organization_name: 'Acme Corp',
    primary_email: 'jane@acme.example',
    secondary_email: 'billing@acme.example',
    primary_phone: '+14155550100',
    secondary_phone: '+14155550101',
    tax_number: 'TX-123',
    cr_number: 'CR-456',
    currency: 'USD',
    is_archived: false,
    country: 'US',
    city: 'San Francisco',
    address: '123 Main St',
    zipcode: '94105',
    ...overrides,
  }
}

function makeVendor(overrides: Partial<MezanVendor> = {}): MezanVendor {
  return {
    id: 'vnd_001',
    name: 'Supply Co',
    organization_name: 'Supply Co LLC',
    primary_email: 'orders@supply.example',
    primary_phone: '+14155559999',
    currency: 'USD',
    is_archived: false,
    country: 'US',
    city: 'Los Angeles',
    address: '456 Broadway',
    zipcode: '90001',
    ...overrides,
  }
}

describe('transformCustomer (mezan)', () => {
  it('prefixes id with cust_', () => {
    expect(transformCustomer(makeCustomer()).id).toBe('cust_cust_001')
  })

  it('maps name', () => {
    expect(transformCustomer(makeCustomer()).name).toBe('Jane Doe')
  })

  it('maps organization_name to companyName', () => {
    expect(transformCustomer(makeCustomer()).companyName).toBe('Acme Corp')
  })

  it('maps cr_number to identification', () => {
    expect(transformCustomer(makeCustomer()).identification).toBe('CR-456')
  })

  it('maps tax_number to taxNumber', () => {
    expect(transformCustomer(makeCustomer()).taxNumber).toBe('TX-123')
  })

  it('sets isCustomer=true and isSupplier=false', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps is_archived=false to isActive=true', () => {
    expect(transformCustomer(makeCustomer({ is_archived: false })).isActive).toBe(true)
  })

  it('maps is_archived=true to isActive=false', () => {
    expect(transformCustomer(makeCustomer({ is_archived: true })).isActive).toBe(false)
  })

  it('maps primary_email as WORK', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.emails![0]).toEqual({ email: 'jane@acme.example', type: 'WORK' })
  })

  it('maps secondary_email as OTHER', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.emails![1]).toEqual({ email: 'billing@acme.example', type: 'OTHER' })
  })

  it('maps primary_phone as WORK', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.telephones![0]).toEqual({ telephone: '+14155550100', type: 'WORK' })
  })

  it('maps secondary_phone as OTHER', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.telephones![1]).toEqual({ telephone: '+14155550101', type: 'OTHER' })
  })

  it('maps billing address from address/city/country/zipcode', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.billingAddress?.address1).toBe('123 Main St')
    expect(result.billingAddress?.city).toBe('San Francisco')
    expect(result.billingAddress?.postalCode).toBe('94105')
    expect(result.billingAddress?.country).toBe('US')
  })

  it('passes raw object as metadata', () => {
    const raw = makeCustomer()
    expect(transformCustomer(raw).metadata).toBe(raw)
  })

  it('passes ContactSchema validation', () => {
    expect(() => ContactSchema.parse(transformCustomer(makeCustomer()))).not.toThrow()
  })
})

describe('transformVendor (mezan)', () => {
  it('prefixes id with vend_', () => {
    expect(transformVendor(makeVendor()).id).toBe('vend_vnd_001')
  })

  it('maps name', () => {
    expect(transformVendor(makeVendor()).name).toBe('Supply Co')
  })

  it('maps organization_name to companyName', () => {
    expect(transformVendor(makeVendor()).companyName).toBe('Supply Co LLC')
  })

  it('sets isSupplier=true and isCustomer=false', () => {
    const result = transformVendor(makeVendor())
    expect(result.isSupplier).toBe(true)
    expect(result.isCustomer).toBe(false)
  })

  it('maps primary_email as WORK', () => {
    const result = transformVendor(makeVendor())
    expect(result.emails![0]).toEqual({ email: 'orders@supply.example', type: 'WORK' })
  })

  it('maps billing address', () => {
    const result = transformVendor(makeVendor())
    expect(result.billingAddress?.address1).toBe('456 Broadway')
    expect(result.billingAddress?.city).toBe('Los Angeles')
    expect(result.billingAddress?.country).toBe('US')
  })

  it('passes ContactSchema validation', () => {
    expect(() => ContactSchema.parse(transformVendor(makeVendor()))).not.toThrow()
  })
})
