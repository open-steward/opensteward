import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type RefrensBusiness,
} from '../../../../../../../src/verticals/accounting/adapters/refrens/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeBusiness(overrides: Partial<RefrensBusiness> = {}): RefrensBusiness {
  return {
    _id: 'biz_001',
    name: 'Acme Pvt Ltd',
    country: 'IN',
    gstin: '22AAAAA0000A1Z5',
    urlKey: 'acme-pvt-ltd',
    currency: 'INR',
    billedTo: {
      name: 'Acme Pvt Ltd',
      street: '101 Brigade Road',
      city: 'Bengaluru',
      pincode: '560001',
      gstState: 'Karnataka',
      country: 'IN',
    },
    createdAt: '2023-06-01T00:00:00.000Z',
    updatedAt: '2024-01-15T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps _id to id', () => {
    const result = transformOrganization(makeBusiness({ _id: 'biz_xyz' }))
    expect(result.id).toBe('biz_xyz')
  })

  it('maps name from top-level name field', () => {
    const result = transformOrganization(makeBusiness({ name: 'My Business' }))
    expect(result.name).toBe('My Business')
  })

  it('falls back to billedTo.name when top-level name is absent', () => {
    const result = transformOrganization(
      makeBusiness({ name: undefined, billedTo: { name: 'Fallback Name' } }),
    )
    expect(result.name).toBe('Fallback Name')
  })

  it('sets legalName same as name', () => {
    const result = transformOrganization(makeBusiness({ name: 'Acme Pvt Ltd' }))
    expect(result.legalName).toBe('Acme Pvt Ltd')
  })

  it('maps urlKey to organizationCode', () => {
    const result = transformOrganization(makeBusiness({ urlKey: 'acme-pvt-ltd' }))
    expect(result.organizationCode).toBe('acme-pvt-ltd')
  })

  it('maps gstin to taxNumber', () => {
    const result = transformOrganization(makeBusiness({ gstin: '29GGGGG0000G1Z0' }))
    expect(result.taxNumber).toBe('29GGGGG0000G1Z0')
  })

  it('maps currency', () => {
    const result = transformOrganization(makeBusiness({ currency: 'USD' }))
    expect(result.currency).toBe('USD')
  })

  it('maps billedTo address fields', () => {
    const result = transformOrganization(makeBusiness())
    expect(result.address?.address1).toBe('101 Brigade Road')
    expect(result.address?.city).toBe('Bengaluru')
    expect(result.address?.postalCode).toBe('560001')
    expect(result.address?.region).toBe('Karnataka')
  })

  it('prefers top-level country for address country', () => {
    const result = transformOrganization(
      makeBusiness({ country: 'IN', billedTo: { country: 'SG' } }),
    )
    expect(result.address?.country).toBe('IN')
  })

  it('parses createdAt and updatedAt as Date objects', () => {
    const result = transformOrganization(makeBusiness())
    expect(result.createdAt).toEqual(new Date('2023-06-01T00:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2024-01-15T00:00:00.000Z'))
  })

  it('passes raw object through as metadata (reference equality)', () => {
    const raw = makeBusiness()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces output that satisfies OrganizationSchema', () => {
    const result = transformOrganization(makeBusiness())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })

  it('handles missing billedTo gracefully', () => {
    const result = transformOrganization(makeBusiness({ billedTo: undefined }))
    expect(result.name).toBe('Acme Pvt Ltd')
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
