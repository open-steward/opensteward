import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawMazricaCustomer,
} from '../../../../../../../src/verticals/crm/adapters/mazrica/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawMazricaCustomer> = {}): RawMazricaCustomer {
  return { id: 1, name: 'Acme Corp', ...overrides }
}

describe('mazrica transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw({ id: 7 })).id).toBe('7')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw({ name: 'SomeCo' })).name).toBe('SomeCo')
  })

  it('maps telNo to phone', () => {
    expect(transformCompany(makeRaw({ telNo: '+81312345678' })).phone).toBe('+81312345678')
  })

  it('maps webUrl to domain', () => {
    expect(transformCompany(makeRaw({ webUrl: 'someco.jp' })).domain).toBe('someco.jp')
  })

  it('maps employee to size when >= 0', () => {
    expect(transformCompany(makeRaw({ employee: 300 })).size).toBe(300)
  })

  it('returns undefined size for negative employee value', () => {
    expect(transformCompany(makeRaw({ employee: -1 })).size).toBeUndefined()
  })

  it('returns undefined size when employee is absent', () => {
    expect(transformCompany(makeRaw()).size).toBeUndefined()
  })

  it('maps createdAt to IsoDatetime', () => {
    const result = transformCompany(makeRaw({ createdAt: '2024-05-01T00:00:00.000Z' }))
    expect(result.created_at).toBe('2024-05-01T00:00:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('passes CompanySchema validation', () => {
    const raw: RawMazricaCustomer = {
      id: 10,
      name: 'TechCorp Japan',
      telNo: '+81312345678',
      webUrl: 'techcorp.jp',
      employee: 500,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-06-01T00:00:00.000Z',
    }
    const result = transformCompany(raw)
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('mazrica untransformCompany', () => {
  it('maps name', () => {
    expect(untransformCompany({ name: 'SomeCo' }).name).toBe('SomeCo')
  })

  it('maps phone to telNo', () => {
    expect(untransformCompany({ phone: '+81312345678' }).telNo).toBe('+81312345678')
  })

  it('maps domain to webUrl', () => {
    expect(untransformCompany({ domain: 'someco.jp' }).webUrl).toBe('someco.jp')
  })

  it('maps size to employee', () => {
    expect(untransformCompany({ size: 300 }).employee).toBe(300)
  })
})
