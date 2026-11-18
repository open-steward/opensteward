import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawInsightlyCompany,
} from '../../../../../../../src/verticals/crm/adapters/insightly/transform/company'

function makeRaw(overrides: Partial<RawInsightlyCompany> = {}): RawInsightlyCompany {
  return { ORGANISATION_ID: 1, ORGANISATION_NAME: 'Acme', ...overrides }
}

describe('insightly transformCompany', () => {
  it('maps ORGANISATION_ID to string id', () => {
    expect(transformCompany(makeRaw({ ORGANISATION_ID: 5 })).id).toBe('5')
  })

  it('maps ORGANISATION_NAME to name', () => {
    expect(transformCompany(makeRaw()).name).toBe('Acme')
  })

  it('maps WEBSITE to domain', () => {
    expect(transformCompany(makeRaw({ WEBSITE: 'https://acme.com' })).domain).toBe('https://acme.com')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw({ ORGANISATION_ID: 5 }))
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('insightly untransformCompany', () => {
  it('maps name to ORGANISATION_NAME', () => {
    const result = untransformCompany({ name: 'Corp' })
    expect(result.ORGANISATION_NAME).toBe('Corp')
  })
})
