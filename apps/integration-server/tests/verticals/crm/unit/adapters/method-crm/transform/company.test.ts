import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawMethodCustomer,
} from '../../../../../../../src/verticals/crm/adapters/method-crm/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawMethodCustomer> = {}): RawMethodCustomer {
  return {
    RecordId: '10',
    CompanyName: 'Acme Corp',
    Name: 'Acme Corp Fallback',
    Phone: '+14155550123',
    BillingLine1: '123 Main St',
    BillingCity: 'San Francisco',
    BillingState: 'CA',
    BillingPostalCode: '94102',
    BillingCountry: 'US',
    CreatedDate: '2026-01-15T09:30:00.000Z',
    ModifiedDate: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('method-crm transformCompany', () => {
  it('maps RecordId to string id', () => {
    expect(transformCompany(makeRaw({ RecordId: 55 })).id).toBe('55')
  })

  it('prefers CompanyName over Name for display name', () => {
    expect(transformCompany(makeRaw()).name).toBe('Acme Corp')
  })

  it('falls back to Name when CompanyName is absent', () => {
    expect(transformCompany(makeRaw({ CompanyName: undefined })).name).toBe('Acme Corp Fallback')
  })

  it('maps Phone to phone', () => {
    expect(transformCompany(makeRaw()).phone).toBe('+14155550123')
  })

  it('maps billing address fields', () => {
    const address = transformCompany(makeRaw()).address
    expect(address?.line1).toBe('123 Main St')
    expect(address?.city).toBe('San Francisco')
    expect(address?.region).toBe('CA')
    expect(address?.postalCode).toBe('94102')
    expect(address?.country).toBe('US')
  })

  it('omits address when no billing fields present', () => {
    const raw = makeRaw({
      BillingLine1: undefined,
      BillingCity: undefined,
      BillingState: undefined,
      BillingPostalCode: undefined,
      BillingCountry: undefined,
    })
    expect(transformCompany(raw).address).toBeUndefined()
  })

  it('maps CreatedDate / ModifiedDate', () => {
    const result = transformCompany(makeRaw())
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('passes CompanySchema validation', () => {
    expect(() => CompanySchema.parse(transformCompany(makeRaw()))).not.toThrow()
  })

  it('untransformCompany maps name to CompanyName', () => {
    expect(untransformCompany({ name: 'Widgets Inc' }).CompanyName).toBe('Widgets Inc')
  })

  it('untransformCompany maps address fields', () => {
    const out = untransformCompany({
      address: {
        line1: '1 Broadway',
        city: 'New York',
        region: 'NY',
        postalCode: '10004',
        country: 'US',
      },
    })
    expect(out.BillingLine1).toBe('1 Broadway')
    expect(out.BillingCity).toBe('New York')
  })
})
