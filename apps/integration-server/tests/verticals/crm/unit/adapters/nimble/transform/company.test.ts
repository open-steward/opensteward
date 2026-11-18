import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawNimbleCompany,
} from '../../../../../../../src/verticals/crm/adapters/nimble/transform/company'

function makeRaw(overrides: Partial<RawNimbleCompany> = {}): RawNimbleCompany {
  return { id: 'nc-1', ...overrides }
}

describe('nimble transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw({ id: 'nc-1' })).id).toBe('nc-1')
  })

  it('extracts company_name from fields', () => {
    const result = transformCompany(makeRaw({ fields: { company_name: [{ value: 'Nimble Corp' }] } }))
    expect(result.name).toBe('Nimble Corp')
  })

  it('falls back to id string when company_name absent', () => {
    expect(transformCompany(makeRaw({ id: 'nc-2' })).name).toBe('nc-2')
  })

  it('extracts website from fields', () => {
    const result = transformCompany(makeRaw({ fields: { website: [{ value: 'https://nimble.com' }] } }))
    expect(result.domain).toBe('https://nimble.com')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw({ id: 'nc-1' }))
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('nimble untransformCompany', () => {
  it('wraps name in company_name fields', () => {
    const result = untransformCompany({ name: 'Test Corp' })
    const fields = result.fields as Record<string, Array<{ value: string }>>
    expect(fields.company_name[0].value).toBe('Test Corp')
  })
})
