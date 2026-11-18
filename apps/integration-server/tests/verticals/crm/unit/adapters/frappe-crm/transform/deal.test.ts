import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawFrappeDeal,
} from '../../../../../../../src/verticals/crm/adapters/frappe-crm/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(overrides: Partial<RawFrappeDeal> = {}): RawFrappeDeal {
  return { name: 'CRM-DEAL-2024-00001', ...overrides }
}

describe('frappe-crm transformDeal', () => {
  it('maps name doc id to string id', () => {
    expect(transformDeal(makeRaw({ name: 'CRM-DEAL-0001' })).id).toBe('CRM-DEAL-0001')
  })

  it('maps lead_name to title', () => {
    expect(transformDeal(makeRaw({ lead_name: 'Q1 Expansion' })).title).toBe('Q1 Expansion')
  })

  it('falls back to empty string when lead_name absent', () => {
    expect(transformDeal(makeRaw()).title).toBe('')
  })

  it('lowercases status', () => {
    expect(transformDeal(makeRaw({ status: 'Open' })).status).toBe('open')
  })

  it('maps organization to company_id', () => {
    expect(transformDeal(makeRaw({ organization: 'CRM-ORG-0001' })).company_id).toBe('CRM-ORG-0001')
  })

  it('maps deal_owner to owner_id', () => {
    expect(transformDeal(makeRaw({ deal_owner: 'user@example.com' })).owner_id).toBe(
      'user@example.com',
    )
  })

  it('maps probability field', () => {
    expect(transformDeal(makeRaw({ probability: 75 })).probability).toBe(75)
  })

  it('builds value when deal_value > 0', () => {
    const result = transformDeal(makeRaw({ deal_value: 50000, currency: 'EUR' }))
    expect(result.value).toEqual({ amount: 50000, currency: 'EUR' })
  })

  it('defaults currency to USD when absent', () => {
    const result = transformDeal(makeRaw({ deal_value: 50000 }))
    expect(result.value?.currency).toBe('USD')
  })

  it('omits value when deal_value is 0', () => {
    expect(transformDeal(makeRaw({ deal_value: 0 })).value).toBeUndefined()
  })

  it('omits value when deal_value absent', () => {
    expect(transformDeal(makeRaw()).value).toBeUndefined()
  })

  it('converts YYYY-MM-DD expected_closure_date to ISO with T00:00:00Z', () => {
    const result = transformDeal(makeRaw({ expected_closure_date: '2024-03-31' }))
    expect(result.close_date).toBe('2024-03-31T00:00:00Z')
  })

  it('passes through ISO date unchanged for expected_closure_date', () => {
    const result = transformDeal(makeRaw({ expected_closure_date: '2024-03-31T00:00:00Z' }))
    expect(result.close_date).toBe('2024-03-31T00:00:00Z')
  })

  it('falls back to closed_date when expected_closure_date absent', () => {
    const result = transformDeal(makeRaw({ closed_date: '2024-01-15' }))
    expect(result.close_date).toBe('2024-01-15T00:00:00Z')
  })

  it('converts creation/modified timestamps to ISO', () => {
    const result = transformDeal(
      makeRaw({
        creation: '2023-11-01 10:00:00.000000',
        modified: '2023-11-14 22:00:00.000000',
      }),
    )
    expect(result.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(result.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('passes DealSchema validation with full input', () => {
    const raw: RawFrappeDeal = {
      name: 'CRM-DEAL-0001',
      lead_name: 'Q1 Expansion',
      organization: 'CRM-ORG-0001',
      status: 'Open',
      deal_owner: 'user@example.com',
      probability: 75,
      deal_value: 50000,
      currency: 'EUR',
      expected_closure_date: '2024-03-31',
      creation: '2023-11-01T10:00:00.000Z',
      modified: '2023-11-14T22:00:00.000Z',
    }
    const result = transformDeal(raw)
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('frappe-crm untransformDeal', () => {
  it('maps title back to lead_name', () => {
    expect(untransformDeal({ title: 'Q1 Expansion' }).lead_name).toBe('Q1 Expansion')
  })

  it('maps status back', () => {
    expect(untransformDeal({ status: 'open' }).status).toBe('open')
  })

  it('maps owner_id back to deal_owner', () => {
    expect(untransformDeal({ owner_id: 'user@example.com' }).deal_owner).toBe('user@example.com')
  })

  it('maps company_id back to organization', () => {
    expect(untransformDeal({ company_id: 'CRM-ORG-0001' }).organization).toBe('CRM-ORG-0001')
  })

  it('maps probability back', () => {
    expect(untransformDeal({ probability: 75 }).probability).toBe(75)
  })

  it('maps value.amount back to deal_value', () => {
    expect(untransformDeal({ value: { amount: 50000, currency: 'EUR' } }).deal_value).toBe(50000)
  })

  it('maps value.currency back', () => {
    expect(untransformDeal({ value: { amount: 50000, currency: 'EUR' } }).currency).toBe('EUR')
  })

  it('strips time portion from close_date for expected_closure_date', () => {
    expect(untransformDeal({ close_date: '2024-03-31T00:00:00.000Z' }).expected_closure_date).toBe(
      '2024-03-31',
    )
  })

  it('omits unset fields', () => {
    const result = untransformDeal({})
    expect(result).not.toHaveProperty('lead_name')
    expect(result).not.toHaveProperty('deal_value')
  })
})
