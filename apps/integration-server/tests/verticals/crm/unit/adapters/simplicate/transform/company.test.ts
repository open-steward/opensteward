import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawSimplicateOrganization,
} from '../../../../../../../src/verticals/crm/adapters/simplicate/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawSimplicateOrganization> = {}): RawSimplicateOrganization {
  return { id: 'organization:aabb1122', ...overrides }
}

describe('simplicate transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw({ id: 'organization:xyz' })).id).toBe('organization:xyz')
  })

  it('maps name, falling back to empty string', () => {
    expect(transformCompany(makeRaw({ name: 'Acme BV' })).name).toBe('Acme BV')
    expect(transformCompany(makeRaw()).name).toBe('')
  })

  it('maps phone', () => {
    expect(transformCompany(makeRaw({ phone: '+31200000001' })).phone).toBe('+31200000001')
  })

  it('strips https protocol and trailing slash from url to produce domain', () => {
    expect(transformCompany(makeRaw({ url: 'https://www.acme.example/' })).domain).toBe(
      'www.acme.example',
    )
  })

  it('strips http protocol from url to produce domain', () => {
    expect(transformCompany(makeRaw({ url: 'http://acme.example' })).domain).toBe('acme.example')
  })

  it('returns url as-is when no protocol prefix', () => {
    expect(transformCompany(makeRaw({ url: 'acme.example' })).domain).toBe('acme.example')
  })

  it('returns undefined domain when url absent', () => {
    expect(transformCompany(makeRaw()).domain).toBeUndefined()
  })

  it('maps created_at and updated_at as-is', () => {
    const result = transformCompany(
      makeRaw({
        created_at: '2024-03-01T00:00:00+00:00',
        updated_at: '2024-09-01T00:00:00+00:00',
      }),
    )
    expect(result.created_at).toBe('2024-03-01T00:00:00+00:00')
    expect(result.updated_at).toBe('2024-09-01T00:00:00+00:00')
  })

  it('preserves raw metadata', () => {
    const raw = makeRaw({ name: 'Corp' })
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    const raw: RawSimplicateOrganization = {
      id: 'organization:cc001122',
      name: 'Test BV',
      phone: '+31200001111',
      url: 'https://testbv.example',
      created_at: '2024-01-01T00:00:00+00:00',
      updated_at: '2024-06-01T00:00:00+00:00',
    }
    expect(() => CompanySchema.parse(transformCompany(raw))).not.toThrow()
  })
})

describe('simplicate untransformCompany', () => {
  it('maps name', () => {
    expect(untransformCompany({ name: 'NewCo' })).toMatchObject({ name: 'NewCo' })
  })

  it('maps domain back to url with https prefix', () => {
    expect(untransformCompany({ domain: 'newco.example' })).toMatchObject({
      url: 'https://newco.example',
    })
  })

  it('maps phone', () => {
    expect(untransformCompany({ phone: '+31200002222' })).toMatchObject({ phone: '+31200002222' })
  })

  it('omits unset fields', () => {
    expect(Object.keys(untransformCompany({}))).toHaveLength(0)
  })
})
