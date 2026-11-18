import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
} from '../../../../../../../src/verticals/crm/adapters/orocrm/transform/deal'
import type { JsonApiRecord } from '../../../../../../../src/verticals/crm/adapters/orocrm/client'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRecord(
  attrs: Record<string, unknown> = {},
  rels: JsonApiRecord['relationships'] = {},
): JsonApiRecord {
  return {
    type: 'opportunities',
    id: 'opp_1',
    attributes: {
      name: 'Acme Q1 Expansion',
      status: 'open',
      probability: 60,
      budgetAmount: { value: '50000.00', currency: 'USD' },
      closeDate: '2026-03-31',
      createdAt: '2026-01-15T09:30:00.000Z',
      updatedAt: '2026-02-01T14:20:00.000Z',
      ...attrs,
    },
    relationships: {
      owner: { data: { type: 'users', id: 'usr_5' } },
      account: { data: { type: 'accounts', id: 'acc_1' } },
      contact: { data: { type: 'contacts', id: 'cont_1' } },
      ...rels,
    },
  }
}

describe('orocrm transformDeal', () => {
  it('maps record.id to string id', () => {
    expect(transformDeal(makeRecord()).id).toBe('opp_1')
  })

  it('maps name attribute to title', () => {
    expect(transformDeal(makeRecord()).title).toBe('Acme Q1 Expansion')
  })

  it('converts budgetAmount major units to minor (cents)', () => {
    // 50000.00 USD → 5000000 cents
    expect(transformDeal(makeRecord()).value?.amount).toBe(5000000)
  })

  it('maps budgetAmount currency', () => {
    expect(transformDeal(makeRecord()).value?.currency).toBe('USD')
  })

  it('maps status', () => {
    expect(transformDeal(makeRecord()).status).toBe('open')
  })

  it('maps probability', () => {
    expect(transformDeal(makeRecord()).probability).toBe(60)
  })

  it('maps contact relationship to contact_ids array', () => {
    expect(transformDeal(makeRecord()).contact_ids).toEqual(['cont_1'])
  })

  it('maps account relationship to company_id', () => {
    expect(transformDeal(makeRecord()).company_id).toBe('acc_1')
  })

  it('maps owner relationship to owner_id', () => {
    expect(transformDeal(makeRecord()).owner_id).toBe('usr_5')
  })

  it('omits value when budgetAmount is absent', () => {
    expect(transformDeal(makeRecord({ budgetAmount: null })).value).toBeUndefined()
  })

  it('maps createdAt / updatedAt', () => {
    const result = transformDeal(makeRecord())
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('passes DealSchema validation', () => {
    expect(() => DealSchema.parse(transformDeal(makeRecord()))).not.toThrow()
  })

  it('untransformDeal wraps in JSON:API envelope with type "opportunities"', () => {
    const out = untransformDeal({
      title: 'Big Sale',
      status: 'won',
      value: { amount: 5000000, currency: 'USD' },
    })
    expect((out['data'] as Record<string, unknown>)['type']).toBe('opportunities')
    const attrs = (out['data'] as Record<string, Record<string, unknown>>)['attributes']
    expect(attrs['name']).toBe('Big Sale')
    expect(attrs['status']).toBe('won')
    // 5000000 cents → "50000.00"
    expect((attrs['budgetAmount'] as Record<string, unknown>)['value']).toBe('50000.00')
  })
})
