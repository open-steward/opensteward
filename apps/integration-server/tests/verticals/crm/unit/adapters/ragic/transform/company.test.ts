import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
} from '../../../../../../../src/verticals/crm/adapters/ragic/transform/company'
import type { RagicRecord } from '../../../../../../../src/verticals/crm/adapters/ragic/client'

function makeRaw(overrides: Partial<RagicRecord> = {}): RagicRecord {
  return { _ragic_id: 1, ...overrides }
}

describe('ragic transformCompany', () => {
  it('maps _ragic_id to id string', () => {
    expect(transformCompany(makeRaw({ _ragic_id: 7 })).id).toBe('7')
  })

  it('maps Company Name field to name', () => {
    expect(transformCompany(makeRaw({ 'Company Name': 'Ragic Corp' })).name).toBe('Ragic Corp')
  })

  it('maps Website field to domain', () => {
    expect(transformCompany(makeRaw({ 'Website': 'https://ragic.com' })).domain).toBe('https://ragic.com')
  })

  it('handles empty record gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw({ _ragic_id: 7 }))
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('ragic untransformCompany', () => {
  it('maps name to "Company Name" field key', () => {
    const result = untransformCompany({ name: 'Acme' })
    expect(result['Company Name']).toBe('Acme')
  })
})
