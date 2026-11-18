import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawEngageBayCompany,
} from '../../../../../../../src/verticals/crm/adapters/engagebay/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawEngageBayCompany> = {}): RawEngageBayCompany {
  return { id: 1, ...overrides }
}

describe('engagebay transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw({ id: 55 })).id).toBe('55')
  })

  it('extracts name from properties', () => {
    const raw = makeRaw({ properties: [{ name: 'name', value: 'Acme Corp' }] })
    expect(transformCompany(raw).name).toBe('Acme Corp')
  })

  it('falls back to empty string when name property absent', () => {
    expect(transformCompany(makeRaw()).name).toBe('')
  })

  it('extracts domain from url property', () => {
    const raw = makeRaw({ properties: [{ name: 'url', value: 'acme.example' }] })
    expect(transformCompany(raw).domain).toBe('acme.example')
  })

  it('extracts phone from properties', () => {
    const raw = makeRaw({ properties: [{ name: 'phone', value: '+14155550100' }] })
    expect(transformCompany(raw).phone).toBe('+14155550100')
  })

  it('maps owner_id to string', () => {
    expect(transformCompany(makeRaw({ owner_id: 3 })).owner_id).toBe('3')
  })

  it('maps tags array', () => {
    const raw = makeRaw({ tags: [{ tag: 'enterprise' }] })
    expect(transformCompany(raw).tags).toEqual(['enterprise'])
  })

  it('converts epoch ms timestamps to ISO datetime', () => {
    const raw = makeRaw({ created_time: 1699000000000, updated_time: 1700000000000 })
    const result = transformCompany(raw)
    expect(result.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(result.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('passes CompanySchema validation with full input', () => {
    const raw: RawEngageBayCompany = {
      id: 55,
      owner_id: 3,
      tags: [{ tag: 'enterprise' }],
      created_time: 1699000000000,
      updated_time: 1700000000000,
      properties: [
        { name: 'name', value: 'Acme Corp' },
        { name: 'url', value: 'acme.example' },
        { name: 'phone', value: '+14155550100' },
      ],
    }
    const result = transformCompany(raw)
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('engagebay untransformCompany', () => {
  it('builds name property', () => {
    const result = untransformCompany({ name: 'Acme Corp' })
    const prop = (result.properties as Array<{ name: string; value?: string }>).find(
      (p) => p.name === 'name',
    )
    expect(prop?.value).toBe('Acme Corp')
  })

  it('builds url property for domain', () => {
    const result = untransformCompany({ domain: 'acme.example' })
    const prop = (result.properties as Array<{ name: string; value?: string }>).find(
      (p) => p.name === 'url',
    )
    expect(prop?.value).toBe('acme.example')
  })

  it('converts owner_id to number', () => {
    expect(untransformCompany({ owner_id: '3' }).owner_id).toBe(3)
  })

  it('wraps tags in tag objects', () => {
    const result = untransformCompany({ tags: ['enterprise'] })
    expect(result.tags).toEqual([{ tag: 'enterprise' }])
  })
})
