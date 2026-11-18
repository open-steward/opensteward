import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
} from '../../../../../../../src/verticals/crm/adapters/orocrm/transform/company'
import type { JsonApiRecord } from '../../../../../../../src/verticals/crm/adapters/orocrm/client'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRecord(
  attrs: Record<string, unknown> = {},
  rels: JsonApiRecord['relationships'] = {},
): JsonApiRecord {
  return {
    type: 'accounts',
    id: 'acc_1',
    attributes: {
      name: 'Acme Corp',
      phone: '+14155550123',
      createdAt: '2026-01-15T09:30:00.000Z',
      updatedAt: '2026-02-01T14:20:00.000Z',
      ...attrs,
    },
    relationships: {
      owner: { data: { type: 'users', id: 'usr_5' } },
      ...rels,
    },
  }
}

describe('orocrm transformCompany', () => {
  it('maps record.id to string id', () => {
    expect(transformCompany(makeRecord()).id).toBe('acc_1')
  })

  it('maps name attribute', () => {
    expect(transformCompany(makeRecord()).name).toBe('Acme Corp')
  })

  it('uses empty string when name is absent', () => {
    expect(transformCompany(makeRecord({ name: undefined })).name).toBe('')
  })

  it('maps phone attribute', () => {
    expect(transformCompany(makeRecord()).phone).toBe('+14155550123')
  })

  it('maps owner relationship to owner_id', () => {
    expect(transformCompany(makeRecord()).owner_id).toBe('usr_5')
  })

  it('maps createdAt / updatedAt', () => {
    const result = transformCompany(makeRecord())
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('returns undefined owner_id when owner relationship is absent', () => {
    const record: import('../../../../../../../src/verticals/crm/adapters/orocrm/client').JsonApiRecord =
      { type: 'accounts', id: 'acc_2', attributes: { name: 'No Owner Co' } }
    expect(transformCompany(record).owner_id).toBeUndefined()
  })

  it('passes CompanySchema validation', () => {
    expect(() => CompanySchema.parse(transformCompany(makeRecord()))).not.toThrow()
  })

  it('untransformCompany wraps in JSON:API envelope with type "accounts"', () => {
    const out = untransformCompany({ name: 'Widgets Inc', phone: '+1111' })
    expect((out['data'] as Record<string, unknown>)['type']).toBe('accounts')
    const attrs = (out['data'] as Record<string, Record<string, unknown>>)['attributes']
    expect(attrs['name']).toBe('Widgets Inc')
    expect(attrs['phone']).toBe('+1111')
  })
})
