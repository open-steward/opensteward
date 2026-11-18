import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type WhitebooksOrgDtls,
} from '../../../../../../../src/verticals/accounting/adapters/whitebooks/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeRaw(overrides: Partial<WhitebooksOrgDtls> = {}): WhitebooksOrgDtls {
  return {
    gstin: '29AABCU9603R1ZM',
    lgnm: 'Acme Industries Pvt Ltd',
    trdnm: 'Acme Industries',
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

describe('transformOrganization (whitebooks)', () => {
  it('maps lgnm to name', () => {
    expect(transformOrganization(makeRaw()).name).toBe('Acme Industries Pvt Ltd')
  })

  it('maps lgnm to legalName', () => {
    expect(transformOrganization(makeRaw()).legalName).toBe('Acme Industries Pvt Ltd')
  })

  it('maps gstin to taxNumber', () => {
    expect(transformOrganization(makeRaw()).taxNumber).toBe('29AABCU9603R1ZM')
  })

  it('sets currency to INR', () => {
    expect(transformOrganization(makeRaw()).currency).toBe('INR')
  })

  it('maps pradr.addr.loc to address city', () => {
    expect(transformOrganization(makeRaw()).address?.city).toBe('Bengaluru')
  })

  it('maps pradr.addr.pncd to address postalCode', () => {
    expect(transformOrganization(makeRaw()).address?.postalCode).toBe('560001')
  })

  it('hardcodes address country to IN', () => {
    expect(transformOrganization(makeRaw()).address?.country).toBe('IN')
  })

  it('falls back name to trdnm when lgnm absent', () => {
    expect(transformOrganization(makeRaw({ lgnm: undefined })).name).toBe('Acme Industries')
  })

  it('produces a schema-valid Organization', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeRaw()))).not.toThrow()
  })

  it('handles empty raw without throwing', () => {
    expect(() => OrganizationSchema.parse(transformOrganization({}))).not.toThrow()
  })
})
