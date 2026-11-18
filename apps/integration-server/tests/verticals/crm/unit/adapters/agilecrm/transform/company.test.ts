import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawAgileCrmCompany,
} from '../../../../../../../src/verticals/crm/adapters/agilecrm/transform/company'

/**
 * The first company of the documented 2.3 "Get list of companies" example
 * response (github.com/agilecrm/rest-api README), plus the `url` and `phone`
 * SYSTEM properties from the documented 2.1 company request.
 */
function documented(): RawAgileCrmCompany {
  return {
    id: 5638758711951360,
    type: 'COMPANY',
    created_time: 1439390694,
    updated_time: 0,
    last_contacted: 0,
    last_emailed: 0,
    last_campaign_emaild: 0,
    last_called: 0,
    viewed_time: 0,
    viewed: { viewed_time: 0 },
    star_value: 0,
    lead_score: 0,
    tags: [],
    tagsWithTime: [],
    properties: [
      { type: 'SYSTEM', name: 'name', value: 'infosys' },
      { type: 'SYSTEM', name: 'name_lower', value: 'infosys' },
      { type: 'SYSTEM', name: 'url', value: 'http://www.spicejet.com/' },
      { name: 'phone', value: '45500000', subtype: '' },
      { name: 'website', value: 'http://www.linkedin.com/company/agile-crm', subtype: 'LINKEDIN' },
    ],
  }
}

describe('agilecrm transformCompany', () => {
  it('maps the documented list example onto the canonical schema', () => {
    const out = CompanySchema.parse(transformCompany(documented()))
    expect(out.id).toBe('5638758711951360')
    expect(out.name).toBe('infosys')
    expect(out.phone).toBe('45500000')
    expect(out.tags).toEqual([])
    expect(out.created_at).toBe(new Date(1439390694 * 1000).toISOString())
    // updated_time 0 is "never", not the epoch.
    expect(out.updated_at).toBeUndefined()
  })

  it('takes the domain from the company `url` property, not a social `website` link', () => {
    expect(transformCompany(documented()).domain).toBe('www.spicejet.com')
  })

  it('omits the domain when there is no `url` property', () => {
    const raw = documented()
    raw.properties = raw.properties.filter((p) => p.name !== 'url')
    const out = CompanySchema.parse(transformCompany(raw))
    expect(out.domain).toBeUndefined()
  })

  it('refuses a company with no `name` property instead of inventing one', () => {
    const raw = documented()
    raw.properties = raw.properties.filter((p) => p.name !== 'name')
    expect(() => transformCompany(raw)).toThrow(/name/)
  })

  it('preserves raw metadata by reference', () => {
    const raw = documented()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('untransformCompany builds properties array', () => {
    const result = untransformCompany({ name: 'Corp', domain: 'corp.com' })
    const props = result.properties as Array<{ name: string; value: string }>
    expect(props.some((p) => p.name === 'name' && p.value === 'Corp')).toBe(true)
  })
})
