import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawNocrmClient,
} from '../../../../../../../src/verticals/crm/adapters/nocrm-io/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawNocrmClient> = {}): RawNocrmClient {
  return {
    id: 10,
    name: 'Acme Corp',
    description: 'Big client',
    is_active: true,
    created_at: '2026-01-15T09:30:00.000Z',
    user_id: 5,
    extended_info: {
      fields: {
        email: 'info@acme.example',
        phone: '+14155550123',
        web: 'acme.example',
        address: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        zipcode: '94102',
        country: 'US',
      },
      user: { id: 5, firstname: 'Alice', lastname: 'Smith', email: 'alice@example.com' },
    },
    ...overrides,
  }
}

describe('nocrm-io transformCompany', () => {
  it('maps id (number) to string id', () => {
    expect(transformCompany(makeRaw({ id: 10 })).id).toBe('10')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw()).name).toBe('Acme Corp')
  })

  it('maps extended_info.fields.web to domain', () => {
    expect(transformCompany(makeRaw()).domain).toBe('acme.example')
  })

  it('maps extended_info.fields.phone to phone', () => {
    expect(transformCompany(makeRaw()).phone).toBe('+14155550123')
  })

  it('maps address fields from extended_info.fields', () => {
    const address = transformCompany(makeRaw()).address
    expect(address?.line1).toBe('123 Main St')
    expect(address?.city).toBe('San Francisco')
    expect(address?.region).toBe('CA')
    expect(address?.postalCode).toBe('94102')
    expect(address?.country).toBe('US')
  })

  it('resolves owner_id from extended_info.user.id', () => {
    expect(transformCompany(makeRaw()).owner_id).toBe('5')
  })

  it('falls back owner_id to top-level user_id when extended_info.user absent', () => {
    const raw = makeRaw({ extended_info: undefined, user_id: 9 })
    expect(transformCompany(raw).owner_id).toBe('9')
  })

  it('maps created_at', () => {
    expect(transformCompany(makeRaw()).created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('omits address when no address fields present', () => {
    const raw = makeRaw({
      extended_info: {
        fields: { email: 'x@y.com' }, // no address fields
      },
    })
    expect(transformCompany(raw).address).toBeUndefined()
  })

  it('passes CompanySchema validation', () => {
    expect(() => CompanySchema.parse(transformCompany(makeRaw()))).not.toThrow()
  })

  it('untransformCompany maps name and phone', () => {
    const out = untransformCompany({ name: 'Widgets', phone: '+1111' })
    expect(out['name']).toBe('Widgets')
    expect((out['extended_info'] as Record<string, unknown>)?.['fields']).toMatchObject({
      phone: '+1111',
    })
  })
})
