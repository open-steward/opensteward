import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawClarifyCompany,
} from '../../../../../../../src/verticals/crm/adapters/clarify/transform/company'

function makeRaw(overrides: Partial<RawClarifyCompany> = {}): RawClarifyCompany {
  return { id: 'co-1', attributes: {}, ...overrides }
}

describe('clarify transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw({ id: 'co-99' })).id).toBe('co-99')
  })

  it('maps name', () => {
    const result = transformCompany(makeRaw({ attributes: { name: 'Acme Corp' } }))
    expect(result.name).toBe('Acme Corp')
  })

  it('defaults name to empty string when absent', () => {
    const result = transformCompany(makeRaw({ attributes: {} }))
    expect(result.name).toBe('')
  })

  it('picks first domain from domains array', () => {
    const result = transformCompany(
      makeRaw({ attributes: { domains: ['acme.com', 'acme.org'] } }),
    )
    expect(result.domain).toBe('acme.com')
  })

  it('domain is undefined when domains is absent', () => {
    const result = transformCompany(makeRaw({ attributes: {} }))
    expect(result.domain).toBeUndefined()
  })

  it('picks phone from object-style phone_numbers entry', () => {
    const result = transformCompany(
      makeRaw({ attributes: { phone_numbers: [{ value: '+1-800-555-0100', type: 'main' }] } }),
    )
    expect(result.phone).toBe('+1-800-555-0100')
  })

  it('picks phone from plain string phone_numbers entry', () => {
    const result = transformCompany(
      makeRaw({ attributes: { phone_numbers: ['+1-800-555-0200'] } }),
    )
    expect(result.phone).toBe('+1-800-555-0200')
  })

  it('returns undefined phone when phone_numbers is empty', () => {
    const result = transformCompany(makeRaw({ attributes: { phone_numbers: [] } }))
    expect(result.phone).toBeUndefined()
  })

  it('parses employee_count as number when already a number', () => {
    const result = transformCompany(makeRaw({ attributes: { employee_count: 150 } }))
    expect(result.size).toBe(150)
  })

  it('parses employee_count from string', () => {
    const result = transformCompany(makeRaw({ attributes: { employee_count: '250' } }))
    expect(result.size).toBe(250)
  })

  it('returns undefined size when employee_count is absent', () => {
    const result = transformCompany(makeRaw({ attributes: {} }))
    expect(result.size).toBeUndefined()
  })

  it('returns undefined size when employee_count is a non-numeric string', () => {
    const result = transformCompany(makeRaw({ attributes: { employee_count: 'unknown' } }))
    expect(result.size).toBeUndefined()
  })

  it('maps owner_id and timestamps', () => {
    const result = transformCompany(
      makeRaw({
        attributes: {
          owner_id: 'u-5',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-06-01T00:00:00Z',
        },
      }),
    )
    expect(result.owner_id).toBe('u-5')
    expect(result.created_at).toBe('2024-01-01T00:00:00Z')
    expect(result.updated_at).toBe('2024-06-01T00:00:00Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw({ id: 'co-99' }))
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('clarify untransformCompany', () => {
  it('wraps output in JSON:API data envelope with type "company"', () => {
    const result = untransformCompany({ name: 'Acme Corp' }) as {
      data: { type: string; attributes: Record<string, unknown> }
    }
    expect(result.data.type).toBe('company')
    expect(result.data.attributes.name).toBe('Acme Corp')
  })

  it('wraps domain as domains array', () => {
    const result = untransformCompany({ domain: 'acme.com' }) as {
      data: { attributes: { domains: string[] } }
    }
    expect(result.data.attributes.domains).toEqual(['acme.com'])
  })

  it('wraps phone as phone_numbers array with work type', () => {
    const result = untransformCompany({ phone: '+1-800-555-0100' }) as {
      data: { attributes: { phone_numbers: Array<{ value: string; type: string }> } }
    }
    expect(result.data.attributes.phone_numbers).toEqual([
      { value: '+1-800-555-0100', type: 'work' },
    ])
  })

  it('maps size to employee_count', () => {
    const result = untransformCompany({ size: 500 }) as {
      data: { attributes: { employee_count: number } }
    }
    expect(result.data.attributes.employee_count).toBe(500)
  })
})
