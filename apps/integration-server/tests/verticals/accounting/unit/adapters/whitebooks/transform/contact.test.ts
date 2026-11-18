import { describe, it, expect } from 'vitest'
import {
  transformGstinContact,
  type WhitebooksGstinDtls,
} from '../../../../../../../src/verticals/accounting/adapters/whitebooks/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeRaw(overrides: Partial<WhitebooksGstinDtls> = {}): WhitebooksGstinDtls {
  return {
    gstin: '29AABCU9603R1ZM',
    lgnm: 'Acme Industries Pvt Ltd',
    trdnm: 'Acme Industries',
    rgdt: '15/01/2020',
    sts: 'Active',
    pradr: {
      addr: {
        bno: '10',
        bnm: 'Commerce Tower',
        st: 'MG Road',
        loc: 'Bengaluru',
        stcd: '29',
        pncd: '560001',
      },
    },
    ...overrides,
  }
}

describe('transformGstinContact', () => {
  it('maps gstin to id and taxNumber and identification', () => {
    const result = transformGstinContact(makeRaw())
    expect(result.id).toBe('29AABCU9603R1ZM')
    expect(result.taxNumber).toBe('29AABCU9603R1ZM')
    expect(result.identification).toBe('29AABCU9603R1ZM')
  })

  it('maps lgnm to name and trdnm to companyName', () => {
    const result = transformGstinContact(makeRaw())
    expect(result.name).toBe('Acme Industries Pvt Ltd')
    expect(result.companyName).toBe('Acme Industries')
  })

  it('sets isCustomer=true and isSupplier=false', () => {
    const result = transformGstinContact(makeRaw())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('marks isActive=true when sts is Active and no cxdt', () => {
    const result = transformGstinContact(makeRaw())
    expect(result.isActive).toBe(true)
  })

  it('marks isActive=false when cxdt is set', () => {
    const result = transformGstinContact(makeRaw({ cxdt: '01/06/2023' }))
    expect(result.isActive).toBe(false)
  })

  it('parses rgdt DD/MM/YYYY into createdAt Date', () => {
    const result = transformGstinContact(makeRaw())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt?.toISOString()).toBe('2020-01-15T00:00:00.000Z')
  })

  it('maps pradr.addr fields to billingAddress', () => {
    const result = transformGstinContact(makeRaw())
    expect(result.billingAddress?.city).toBe('Bengaluru')
    expect(result.billingAddress?.postalCode).toBe('560001')
    expect(result.billingAddress?.country).toBe('IN')
  })

  it('falls back name to trdnm when lgnm absent', () => {
    const result = transformGstinContact(makeRaw({ lgnm: undefined }))
    expect(result.name).toBe('Acme Industries')
  })

  it('produces a schema-valid Contact', () => {
    expect(() => ContactSchema.parse(transformGstinContact(makeRaw()))).not.toThrow()
  })

  it('handles empty raw gracefully without throwing', () => {
    expect(() => ContactSchema.parse(transformGstinContact({}))).not.toThrow()
  })
})
