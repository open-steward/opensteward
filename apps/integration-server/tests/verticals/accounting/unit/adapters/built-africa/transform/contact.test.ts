import { describe, it, expect } from 'vitest'
import {
  transformClient,
  transformSupplier,
  type BuiltAfricaClient,
  type BuiltAfricaSupplier,
} from '../../../../../../../src/verticals/accounting/adapters/built-africa/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeClient(overrides: Partial<BuiltAfricaClient> = {}): BuiltAfricaClient {
  return {
    id: 10,
    first_name: 'Jane',
    last_name: 'Doe',
    business_name: 'Acme Corp',
    business_email: 'jane@acme.example',
    phone_number: '+1-555-0101',
    business_phone: '+1-555-0202',
    business_address: '100 Main St',
    archived: false,
    created_at: '2024-01-15T09:30:00Z',
    updated_at: '2024-02-01T14:20:00Z',
    ...overrides,
  }
}

function makeSupplier(overrides: Partial<BuiltAfricaSupplier> = {}): BuiltAfricaSupplier {
  return {
    id: 20,
    supplier_name: 'Global Supplies Ltd',
    supplier_email: 'orders@globalsupplies.example',
    supplier_phone: '+44-20-7946-0958',
    supplier_address: '5 Commerce Ave',
    archived: false,
    created_at: '2024-01-15T09:30:00Z',
    updated_at: '2024-02-01T14:20:00Z',
    ...overrides,
  }
}

describe('transformClient', () => {
  it('maps id to cust_ prefixed string', () => {
    expect(transformClient(makeClient()).id).toBe('cust_10')
  })

  it('uses business_name as name', () => {
    expect(transformClient(makeClient()).name).toBe('Acme Corp')
  })

  it('falls back to first+last when business_name is absent', () => {
    const result = transformClient(makeClient({ business_name: undefined }))
    expect(result.name).toBe('Jane Doe')
  })

  it('maps first_name to firstName', () => {
    expect(transformClient(makeClient()).firstName).toBe('Jane')
  })

  it('maps last_name to lastName', () => {
    expect(transformClient(makeClient()).lastName).toBe('Doe')
  })

  it('maps business_name to companyName', () => {
    expect(transformClient(makeClient()).companyName).toBe('Acme Corp')
  })

  it('sets isCustomer=true and isSupplier=false', () => {
    const result = transformClient(makeClient())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps archived=false to isActive=true', () => {
    expect(transformClient(makeClient({ archived: false })).isActive).toBe(true)
  })

  it('maps archived=true to isActive=false', () => {
    expect(transformClient(makeClient({ archived: true })).isActive).toBe(false)
  })

  it('maps business_email to emails', () => {
    const result = transformClient(makeClient())
    expect(result.emails?.[0]).toEqual({ email: 'jane@acme.example', type: 'WORK' })
  })

  it('returns undefined emails when business_email is absent', () => {
    expect(transformClient(makeClient({ business_email: undefined })).emails).toBeUndefined()
  })

  it('maps phone_number as MOBILE telephone', () => {
    const result = transformClient(makeClient())
    expect(result.telephones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ telephone: '+1-555-0101', type: 'MOBILE' }),
      ]),
    )
  })

  it('maps business_phone as WORK telephone', () => {
    const result = transformClient(makeClient())
    expect(result.telephones).toEqual(
      expect.arrayContaining([expect.objectContaining({ telephone: '+1-555-0202', type: 'WORK' })]),
    )
  })

  it('maps business_address to billingAddress.address1', () => {
    expect(transformClient(makeClient()).billingAddress?.address1).toBe('100 Main St')
  })

  it('falls back to business_location for billingAddress when business_address absent', () => {
    const result = transformClient(
      makeClient({ business_address: undefined, business_location: 'Nairobi, KE' }),
    )
    expect(result.billingAddress?.address1).toBe('Nairobi, KE')
  })

  it('maps created_at to createdAt as Date', () => {
    expect(transformClient(makeClient()).createdAt).toEqual(new Date('2024-01-15T09:30:00Z'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeClient()
    expect(transformClient(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => ContactSchema.parse(transformClient(makeClient()))).not.toThrow()
  })
})

describe('transformSupplier', () => {
  it('maps id to supp_ prefixed string', () => {
    expect(transformSupplier(makeSupplier()).id).toBe('supp_20')
  })

  it('maps supplier_name to name', () => {
    expect(transformSupplier(makeSupplier()).name).toBe('Global Supplies Ltd')
  })

  it('maps supplier_name to companyName', () => {
    expect(transformSupplier(makeSupplier()).companyName).toBe('Global Supplies Ltd')
  })

  it('sets isCustomer=false and isSupplier=true', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps archived=false to isActive=true', () => {
    expect(transformSupplier(makeSupplier({ archived: false })).isActive).toBe(true)
  })

  it('maps archived=true to isActive=false', () => {
    expect(transformSupplier(makeSupplier({ archived: true })).isActive).toBe(false)
  })

  it('maps supplier_email to emails', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.emails?.[0]).toEqual({
      email: 'orders@globalsupplies.example',
      type: 'WORK',
    })
  })

  it('returns undefined emails when supplier_email is absent', () => {
    expect(transformSupplier(makeSupplier({ supplier_email: undefined })).emails).toBeUndefined()
  })

  it('maps supplier_phone as WORK telephone', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.telephones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ telephone: '+44-20-7946-0958', type: 'WORK' }),
      ]),
    )
  })

  it('maps supplier_address to billingAddress.address1', () => {
    expect(transformSupplier(makeSupplier()).billingAddress?.address1).toBe('5 Commerce Ave')
  })

  it('falls back to supplier_location for billingAddress when supplier_address absent', () => {
    const result = transformSupplier(
      makeSupplier({ supplier_address: undefined, supplier_location: 'Lagos, NG' }),
    )
    expect(result.billingAddress?.address1).toBe('Lagos, NG')
  })

  it('maps created_at to createdAt as Date', () => {
    expect(transformSupplier(makeSupplier()).createdAt).toEqual(new Date('2024-01-15T09:30:00Z'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeSupplier()
    expect(transformSupplier(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => ContactSchema.parse(transformSupplier(makeSupplier()))).not.toThrow()
  })
})
