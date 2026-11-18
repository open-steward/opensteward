import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
} from '../../../../../../../src/verticals/crm/adapters/monday-crm/transform/company'
import type { MondayItem } from '../../../../../../../src/verticals/crm/adapters/monday-crm/client'

function makeRaw(overrides: Partial<MondayItem> = {}): MondayItem {
  return { id: 'mc-1', name: 'Acme', column_values: [], ...overrides }
}

describe('monday-crm transformCompany', () => {
  it('maps id', () => {
    expect(transformCompany(makeRaw({ id: 'mc-1' })).id).toBe('mc-1')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw({ name: 'Acme Corp' })).name).toBe('Acme Corp')
  })

  it('extracts domain from link column', () => {
    const result = transformCompany(makeRaw({
      column_values: [{ id: 'link', text: 'https://acme.com', type: 'link', value: '{}' }],
    }))
    expect(result.domain).toBe('https://acme.com')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw as unknown as Record<string, unknown>)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw({ id: 'mc-1' }))
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('monday-crm untransformCompany', () => {
  it('produces name and column_values string', () => {
    const result = untransformCompany({ name: 'Corp' })
    expect(result.name).toBe('Corp')
    expect(typeof result.column_values).toBe('string')
  })
})
