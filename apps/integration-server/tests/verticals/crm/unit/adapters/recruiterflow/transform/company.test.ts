import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawRecruiterflowCompany,
} from '../../../../../../../src/verticals/crm/adapters/recruiterflow/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawRecruiterflowCompany> = {}): RawRecruiterflowCompany {
  return {
    id: 'client-7',
    name: 'Acme Corp',
    phone: '+14155550123',
    website_url: 'acme.example',
    address: {
      city: 'San Francisco',
      state: 'CA',
      country: 'US',
      postal_code: '94105',
      street: '123 Market St',
    },
    recruiter_id: 'usr-1',
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-01-20T12:00:00.000Z',
    ...overrides,
  }
}

describe('recruiterflow transformCompany', () => {
  it('maps id', () => {
    expect(transformCompany(makeRaw()).id).toBe('client-7')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw()).name).toBe('Acme Corp')
  })

  it('maps phone', () => {
    expect(transformCompany(makeRaw()).phone).toBe('+14155550123')
  })

  it('maps domain from website_url', () => {
    expect(transformCompany(makeRaw()).domain).toBe('acme.example')
  })

  it('maps owner_id from recruiter_id', () => {
    expect(transformCompany(makeRaw()).owner_id).toBe('usr-1')
  })

  it('maps address.city', () => {
    expect(transformCompany(makeRaw()).address?.city).toBe('San Francisco')
  })

  it('maps address.region from state', () => {
    expect(transformCompany(makeRaw()).address?.region).toBe('CA')
  })

  it('maps address.country', () => {
    expect(transformCompany(makeRaw()).address?.country).toBe('US')
  })

  it('maps address.postalCode from postal_code', () => {
    expect(transformCompany(makeRaw()).address?.postalCode).toBe('94105')
  })

  it('maps address.line1 from street', () => {
    expect(transformCompany(makeRaw()).address?.line1).toBe('123 Market St')
  })

  it('sets address to undefined when address absent', () => {
    expect(transformCompany(makeRaw({ address: undefined })).address).toBeUndefined()
  })

  it('maps created_at as ISO datetime', () => {
    expect(transformCompany(makeRaw()).created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('passes CompanySchema validation', () => {
    expect(() => CompanySchema.parse(transformCompany(makeRaw()))).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('untransformCompany round-trips name', () => {
    expect(untransformCompany({ name: 'New Corp' }).name).toBe('New Corp')
  })

  it('untransformCompany maps domain to website_url', () => {
    expect(untransformCompany({ domain: 'new.example' }).website_url).toBe('new.example')
  })
})
