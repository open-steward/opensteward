import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawVitallyAccount,
} from '../../../../../../../src/verticals/crm/adapters/vitally/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawVitallyAccount> = {}): RawVitallyAccount {
  return {
    id: 'acc_001',
    name: 'Acme Industries',
    accountOwnerId: 'usr_owner',
    mrr: 5000,
    createdAt: '2026-01-15T09:30:00.000Z',
    updatedAt: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('vitally transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw()).id).toBe('acc_001')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw()).name).toBe('Acme Industries')
  })

  it('name is empty string when raw.name is null', () => {
    expect(transformCompany(makeRaw({ name: null })).name).toBe('')
  })

  it('maps accountOwnerId to owner_id', () => {
    expect(transformCompany(makeRaw()).owner_id).toBe('usr_owner')
  })

  it('owner_id is undefined when accountOwnerId is not a string', () => {
    expect(transformCompany(makeRaw({ accountOwnerId: null })).owner_id).toBeUndefined()
  })

  it('maps createdAt to created_at', () => {
    expect(transformCompany(makeRaw()).created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('maps updatedAt to updated_at', () => {
    expect(transformCompany(makeRaw()).updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('preserves raw as metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => CompanySchema.parse(transformCompany(makeRaw()))).not.toThrow()
  })

  it('handles minimal input without throwing', () => {
    const minimal: RawVitallyAccount = { id: 'acc_min' }
    expect(() => CompanySchema.parse(transformCompany(minimal))).not.toThrow()
  })
})

describe('vitally untransformCompany', () => {
  it('maps name', () => {
    const out = untransformCompany({ name: 'Acme' })
    expect(out.name).toBe('Acme')
  })

  it('does not include extra fields when nothing specified', () => {
    const out = untransformCompany({})
    expect(Object.keys(out)).toHaveLength(0)
  })
})
