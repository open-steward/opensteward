import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  type RawGallaboxCompany,
} from '../../../../../../../src/verticals/crm/adapters/gallabox/transform/company'

function makeRaw(overrides: Partial<RawGallaboxCompany> = {}): RawGallaboxCompany {
  return { id: 'co-1', ...overrides }
}

describe('gallabox transformCompany', () => {
  it('maps string id to string', () => {
    expect(transformCompany(makeRaw({ id: 'co-99' })).id).toBe('co-99')
  })

  it('maps numeric id to string', () => {
    expect(transformCompany(makeRaw({ id: 7 })).id).toBe('7')
  })

  it('maps name when present', () => {
    expect(transformCompany(makeRaw({ name: 'Acme Corp' })).name).toBe('Acme Corp')
  })

  it('falls back to empty string when name is absent', () => {
    expect(transformCompany(makeRaw()).name).toBe('')
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('does not throw on minimal input', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw({ id: 'co-99' }))
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
