/**
 * Affinity v2 Company → canonical Company.
 *
 * Fixture: the documented example of `CompanyPaged` in
 * https://developer.affinity.co/api-reference/openapi.json (2026-09-17),
 * served by GET /v2/companies ("Paginate through Companies in Affinity.") and,
 * item by item, GET /v2/companies/{companyId}.
 */
import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawAffinityCompany,
} from '../../../../../../../src/verticals/crm/adapters/affinity/transform/company'

/** Verbatim: `CompanyPaged.example.data[0]`. */
const HORIZON: RawAffinityCompany = {
  id: 1,
  name: 'Horizon Technologies',
  domain: 'horizontech.com',
  domains: ['horizontech.com'],
  isGlobal: false,
  fields: [],
}

describe('affinity transformCompany (v2 Company)', () => {
  it('maps the documented example and satisfies the canonical schema', () => {
    const out = CompanySchema.parse(transformCompany(HORIZON))
    expect(out).toEqual({
      id: '1',
      name: 'Horizon Technologies',
      domain: 'horizontech.com',
      metadata: HORIZON,
    })
  })

  it('reads the documented primary `domain`, not the first of `domains`', () => {
    const raw = {
      ...HORIZON,
      domain: 'primary.example',
      domains: ['other.example', 'primary.example'],
    }
    expect(CompanySchema.parse(transformCompany(raw)).domain).toBe('primary.example')
  })

  it('omits domain when the documented `domain` is null', () => {
    const out = CompanySchema.parse(transformCompany({ ...HORIZON, domain: null, domains: [] }))
    expect(out.domain).toBeUndefined()
    expect('domain' in out).toBe(false)
  })

  it('preserves the raw record as metadata', () => {
    expect(transformCompany(HORIZON).metadata).toBe(HORIZON)
  })

  it('untransformCompany (write path, unchanged) wraps domain in an array', () => {
    expect(untransformCompany({ domain: 'foo.com' }).domains).toEqual(['foo.com'])
  })
})
