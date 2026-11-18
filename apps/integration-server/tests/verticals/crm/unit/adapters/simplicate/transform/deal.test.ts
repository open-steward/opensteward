import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawSimplicateSales,
} from '../../../../../../../src/verticals/crm/adapters/simplicate/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(overrides: Partial<RawSimplicateSales> = {}): RawSimplicateSales {
  return { id: 'sales:aabbccdd', ...overrides }
}

describe('simplicate transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 'sales:xyz' })).id).toBe('sales:xyz')
  })

  it('maps subject to title, falling back to empty string', () => {
    expect(transformDeal(makeRaw({ subject: 'Q1 Deal' })).title).toBe('Q1 Deal')
    expect(transformDeal(makeRaw()).title).toBe('')
  })

  it('maps status label from status object', () => {
    expect(transformDeal(makeRaw({ status: { id: 's1', label: 'Open' } })).status).toBe('Open')
  })

  it('maps progress_id to stage_id', () => {
    expect(transformDeal(makeRaw({ progress_id: 'salesprogress:pp001' })).stage_id).toBe(
      'salesprogress:pp001',
    )
  })

  it('prefers progress.id over progress_id for stage_id when both absent', () => {
    const result = transformDeal(
      makeRaw({ progress: { id: 'salesprogress:from-obj', label: 'Proposal' } }),
    )
    expect(result.stage_id).toBe('salesprogress:from-obj')
  })

  it('maps potential_revenue to value.amount with EUR currency', () => {
    const result = transformDeal(makeRaw({ potential_revenue: 12500 }))
    expect(result.value?.amount).toBe(12500)
    expect(result.value?.currency).toBe('EUR')
  })

  it('maps string potential_revenue to number', () => {
    expect(transformDeal(makeRaw({ potential_revenue: '9999.50' })).value?.amount).toBe(9999.5)
  })

  it('maps win_likelihood to probability', () => {
    expect(transformDeal(makeRaw({ win_likelihood: 70 })).probability).toBe(70)
  })

  it('maps end_date to close_date', () => {
    expect(transformDeal(makeRaw({ end_date: '2025-12-31' })).close_date).toBe('2025-12-31')
  })

  it('maps person_id to contact_ids array', () => {
    expect(transformDeal(makeRaw({ person_id: 'person:p1' })).contact_ids).toEqual(['person:p1'])
  })

  it('maps organization_id to company_id', () => {
    expect(transformDeal(makeRaw({ organization_id: 'organization:o1' })).company_id).toBe(
      'organization:o1',
    )
  })

  it('maps responsible_employee.id to owner_id', () => {
    expect(
      transformDeal(makeRaw({ responsible_employee: { id: 'emp:e1', name: 'Bob' } })).owner_id,
    ).toBe('emp:e1')
  })

  it('maps created_at and updated_at as-is', () => {
    const result = transformDeal(
      makeRaw({
        created_at: '2024-01-01T00:00:00+00:00',
        updated_at: '2024-06-01T00:00:00+00:00',
      }),
    )
    expect(result.created_at).toBe('2024-01-01T00:00:00+00:00')
    expect(result.updated_at).toBe('2024-06-01T00:00:00+00:00')
  })

  it('preserves raw metadata', () => {
    const raw = makeRaw({ subject: 'Deal X' })
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    const raw: RawSimplicateSales = {
      id: 'sales:dd001122',
      subject: 'Expansion Deal',
      status: { id: 's1', label: 'Open' },
      progress_id: 'salesprogress:pp001',
      potential_revenue: 50000,
      win_likelihood: 65,
      end_date: '2025-06-30T00:00:00+00:00',
      person_id: 'person:p1',
      organization_id: 'organization:o1',
      responsible_employee: { id: 'emp:e1', name: 'Alice' },
      created_at: '2024-01-01T00:00:00+00:00',
      updated_at: '2024-06-01T00:00:00+00:00',
    }
    expect(() => DealSchema.parse(transformDeal(raw))).not.toThrow()
  })
})

describe('simplicate untransformDeal', () => {
  it('maps title to subject', () => {
    expect(untransformDeal({ title: 'Big Deal' })).toMatchObject({ subject: 'Big Deal' })
  })

  it('maps value.amount to potential_revenue', () => {
    expect(untransformDeal({ value: { amount: 15000, currency: 'EUR' } })).toMatchObject({
      potential_revenue: 15000,
    })
  })

  it('maps close_date to end_date', () => {
    expect(untransformDeal({ close_date: '2025-12-31' })).toMatchObject({ end_date: '2025-12-31' })
  })

  it('maps contact_ids[0] to person_id', () => {
    expect(untransformDeal({ contact_ids: ['person:p1'] })).toMatchObject({
      person_id: 'person:p1',
    })
  })

  it('maps company_id to organization_id', () => {
    expect(untransformDeal({ company_id: 'organization:o1' })).toMatchObject({
      organization_id: 'organization:o1',
    })
  })

  it('omits unset fields', () => {
    expect(Object.keys(untransformDeal({}))).toHaveLength(0)
  })
})
