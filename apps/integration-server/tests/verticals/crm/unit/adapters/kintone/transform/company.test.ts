import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
} from '../../../../../../../src/verticals/crm/adapters/kintone/transform/company'
import type { KintoneRecord } from '../../../../../../../src/verticals/crm/adapters/kintone/client'

function makeRaw(extra: Record<string, { value: unknown }> = {}): KintoneRecord {
  return {
    $id: { value: '10' },
    $revision: { value: '1' },
    ...extra,
  }
}

describe('kintone transformCompany', () => {
  it('maps $id to id', () => {
    expect(transformCompany(makeRaw()).id).toBe('10')
  })

  it('maps company_name field to name', () => {
    const result = transformCompany(makeRaw({ company_name: { value: 'KintoCorp' } }))
    expect(result.name).toBe('KintoCorp')
  })

  it('defaults name to empty string when field missing', () => {
    expect(transformCompany(makeRaw()).name).toBe('')
  })

  it('maps website field to domain', () => {
    const result = transformCompany(makeRaw({ website: { value: 'https://kinto.co' } }))
    expect(result.domain).toBe('https://kinto.co')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw())
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('kintone untransformCompany', () => {
  it('wraps name in value object under company_name key', () => {
    const result = untransformCompany({ name: 'Acme' })
    expect(result['company_name']).toEqual({ value: 'Acme' })
  })
})
