import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
} from '../../../../../../../src/verticals/crm/adapters/podio/transform/company'
import type { PodioItem } from '../../../../../../../src/verticals/crm/adapters/podio/client'

function makeRaw(overrides: Partial<PodioItem> = {}): PodioItem {
  return { item_id: 1, fields: [], ...overrides }
}

describe('podio transformCompany', () => {
  it('maps item_id to id string', () => {
    expect(transformCompany(makeRaw({ item_id: 7 })).id).toBe('7')
  })

  it('falls back to Company {id} name when no name field', () => {
    expect(transformCompany(makeRaw({ item_id: 5 })).name).toBe('Company 5')
  })

  it('extracts name from fields', () => {
    const result = transformCompany(makeRaw({
      item_id: 1,
      fields: [{ external_id: 'name', values: [{ value: 'Acme' }] }],
    }))
    expect(result.name).toBe('Acme')
  })

  it('handles empty fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw({ item_id: 7 }))
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('podio untransformCompany', () => {
  it('returns a fields envelope', () => {
    const result = untransformCompany({ name: 'Acme' })
    expect(result).toHaveProperty('fields')
  })
})
