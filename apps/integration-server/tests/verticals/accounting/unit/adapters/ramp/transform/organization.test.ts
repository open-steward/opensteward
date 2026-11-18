import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type RampBusiness,
} from '../../../../../../../src/verticals/accounting/adapters/ramp/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeBusiness(overrides: Partial<RampBusiness> = {}): RampBusiness {
  return {
    id: 'biz_uuid_001',
    business_name_legal: 'Acme Corporation Inc.',
    display_name: 'Acme Corp',
    website: 'https://acme.example.com',
    employer_id: '12-3456789',
    address: {
      street1: '100 Main Street',
      street2: 'Suite 500',
      city: 'San Francisco',
      state: 'CA',
      postal_code: '94105',
      country: 'US',
    },
    currency_code: 'USD',
    created_time: '2022-01-15T09:00:00Z',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id', () => {
    expect(transformOrganization(makeBusiness()).id).toBe('biz_uuid_001')
  })

  it('prefers display_name over business_name_legal for name', () => {
    expect(transformOrganization(makeBusiness()).name).toBe('Acme Corp')
  })

  it('falls back to business_name_legal when display_name is absent', () => {
    const result = transformOrganization(makeBusiness({ display_name: undefined }))
    expect(result.name).toBe('Acme Corporation Inc.')
  })

  it('maps business_name_legal to legalName', () => {
    expect(transformOrganization(makeBusiness()).legalName).toBe('Acme Corporation Inc.')
  })

  it('maps employer_id to taxNumber', () => {
    expect(transformOrganization(makeBusiness()).taxNumber).toBe('12-3456789')
  })

  it('maps currency_code to currency', () => {
    expect(transformOrganization(makeBusiness()).currency).toBe('USD')
  })

  it('maps website', () => {
    expect(transformOrganization(makeBusiness()).website).toBe('https://acme.example.com')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeBusiness())
    expect(result.address?.address1).toBe('100 Main Street')
    expect(result.address?.address2).toBe('Suite 500')
    expect(result.address?.city).toBe('San Francisco')
    expect(result.address?.region).toBe('CA')
    expect(result.address?.postalCode).toBe('94105')
    expect(result.address?.country).toBe('US')
  })

  it('maps created_time to createdAt as Date', () => {
    expect(transformOrganization(makeBusiness()).createdAt).toEqual(
      new Date('2022-01-15T09:00:00Z'),
    )
  })

  it('address is undefined when address field is absent', () => {
    expect(transformOrganization(makeBusiness({ address: undefined })).address).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeBusiness()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces output that passes OrganizationSchema validation', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeBusiness()))).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformOrganization({})
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
