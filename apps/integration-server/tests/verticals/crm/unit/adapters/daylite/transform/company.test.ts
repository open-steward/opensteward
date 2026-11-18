import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawDayliteCompany,
} from '../../../../../../../src/verticals/crm/adapters/daylite/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawDayliteCompany> = {}): RawDayliteCompany {
  return { self: '/v1/companies/1', name: 'Acme Corp', ...overrides }
}

describe('daylite transformCompany', () => {
  it('extracts id from self URL', () => {
    expect(transformCompany(makeRaw({ self: '/v1/companies/42' })).id).toBe('42')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw({ name: 'Acme Industries' })).name).toBe('Acme Industries')
  })

  it('defaults name to empty string when absent', () => {
    expect(transformCompany(makeRaw({ name: undefined })).name).toBe('')
  })

  it('picks first phone from phone_numbers array', () => {
    const result = transformCompany(
      makeRaw({ phone_numbers: [{ number: '+15550001111', label: 'main' }] }),
    )
    expect(result.phone).toBe('+15550001111')
  })

  it('maps category to industry', () => {
    const result = transformCompany(makeRaw({ category: 'Technology' }))
    expect(result.industry).toBe('Technology')
  })

  it('extracts owner_id from owner URL', () => {
    const result = transformCompany(makeRaw({ owner: '/v1/users/5' }))
    expect(result.owner_id).toBe('5')
  })

  it('passes create_date as created_at', () => {
    const result = transformCompany(makeRaw({ create_date: '2026-01-01T00:00:00.000Z' }))
    expect(result.created_at).toBe('2026-01-01T00:00:00.000Z')
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces a CompanySchema-valid result', () => {
    const raw = makeRaw({
      category: 'Technology',
      create_date: '2026-01-01T00:00:00.000Z',
    })
    expect(() => CompanySchema.parse(transformCompany(raw))).not.toThrow()
  })
})

describe('daylite untransformCompany', () => {
  it('maps name directly', () => {
    const out = untransformCompany({ name: 'Acme Corp' })
    expect(out.name).toBe('Acme Corp')
  })

  it('maps phone → phone_numbers array', () => {
    const out = untransformCompany({ phone: '+15550001111' })
    expect((out.phone_numbers as Array<{ number: string; label: string }>)[0]!.number).toBe(
      '+15550001111',
    )
    expect((out.phone_numbers as Array<{ number: string; label: string }>)[0]!.label).toBe('work')
  })

  it('maps industry → category', () => {
    const out = untransformCompany({ industry: 'Technology' })
    expect(out.category).toBe('Technology')
  })
})
