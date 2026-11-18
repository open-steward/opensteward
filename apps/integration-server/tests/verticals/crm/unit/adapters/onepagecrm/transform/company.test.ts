import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawOnePageCrmCompany,
} from '../../../../../../../src/verticals/crm/adapters/onepagecrm/transform/company'

function makeRaw(overrides: Partial<RawOnePageCrmCompany> = {}): RawOnePageCrmCompany {
  return { id: '1', name: 'Acme', ...overrides }
}

describe('onepagecrm transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw({ id: '5' })).id).toBe('5')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw()).name).toBe('Acme')
  })

  it('maps domain from url', () => {
    expect(transformCompany(makeRaw({ url: 'https://acme.com' })).domain).toBe('https://acme.com')
  })

  it('picks first matching phone number', () => {
    const result = transformCompany(makeRaw({
      phone_numbers: [{ type: 'work', value: '555-9999' }],
    }))
    expect(result.phone).toBe('555-9999')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw({ id: '5' }))
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('onepagecrm untransformCompany', () => {
  it('maps domain to url', () => {
    const result = untransformCompany({ name: 'Corp', domain: 'https://corp.com' })
    expect(result['url']).toBe('https://corp.com')
  })
})
