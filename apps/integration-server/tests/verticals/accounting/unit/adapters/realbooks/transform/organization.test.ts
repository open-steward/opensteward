import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type RealBooksSegment,
} from '../../../../../../../src/verticals/accounting/adapters/realbooks/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeSegment(overrides: Partial<RealBooksSegment> = {}): RealBooksSegment {
  return {
    id: 1,
    name: 'RealBooks Demo Company',
    shortName: 'RBDC',
    code: 'RBDC001',
    country: 'IN',
    currency: 'INR',
    address: {
      address: '42 MG Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pin: '560001',
      email: 'admin@rbdc.co.in',
      phoneNo: '+91 80 0000 0001',
    },
    taxInfo: {
      panNo: 'AABCD1234E',
      vatNo: 'KA29VAT001',
      tinNo: '29KA001234',
    },
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id as string', () => {
    expect(transformOrganization(makeSegment()).id).toBe('1')
  })

  it('falls back to code when id is absent', () => {
    expect(transformOrganization(makeSegment({ id: undefined })).id).toBe('RBDC001')
  })

  it('maps name', () => {
    expect(transformOrganization(makeSegment()).name).toBe('RealBooks Demo Company')
  })

  it('maps name to legalName', () => {
    expect(transformOrganization(makeSegment()).legalName).toBe('RealBooks Demo Company')
  })

  it('maps code to organizationCode', () => {
    expect(transformOrganization(makeSegment()).organizationCode).toBe('RBDC001')
  })

  it('maps taxInfo.panNo to taxNumber (preferred)', () => {
    expect(transformOrganization(makeSegment()).taxNumber).toBe('AABCD1234E')
  })

  it('falls back to vatNo when panNo is absent', () => {
    const seg = makeSegment({ taxInfo: { vatNo: 'KA29VAT001', panNo: undefined } })
    expect(transformOrganization(seg).taxNumber).toBe('KA29VAT001')
  })

  it('falls back to tinNo when panNo and vatNo are absent', () => {
    const seg = makeSegment({ taxInfo: { tinNo: '29KA001234' } })
    expect(transformOrganization(seg).taxNumber).toBe('29KA001234')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeSegment()).currency).toBe('INR')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeSegment())
    expect(result.address?.address1).toBe('42 MG Road')
    expect(result.address?.city).toBe('Bengaluru')
    expect(result.address?.region).toBe('Karnataka')
    expect(result.address?.postalCode).toBe('560001')
    expect(result.address?.country).toBe('IN')
  })

  it('passes raw object as metadata', () => {
    const raw = makeSegment()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces output that passes OrganizationSchema validation', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeSegment()))).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformOrganization({})
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
