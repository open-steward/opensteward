import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawCarerixPublication,
} from '../../../../../../../src/verticals/crm/adapters/carerix/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(overrides: Partial<RawCarerixPublication> = {}): RawCarerixPublication {
  return { publicationID: 1, ...overrides }
}

describe('carerix transformDeal', () => {
  it('maps publicationID to string id', () => {
    expect(transformDeal(makeRaw({ publicationID: 42 })).id).toBe('42')
  })

  it('falls back to id when publicationID is absent', () => {
    expect(transformDeal({ id: 99 }).id).toBe('99')
  })

  it('maps vacancy title to deal title', () => {
    const result = transformDeal(makeRaw({ toVacancy: { title: 'Senior Engineer' } }))
    expect(result.title).toBe('Senior Engineer')
  })

  it('falls back to vacancy name when title absent', () => {
    const result = transformDeal(makeRaw({ toVacancy: { name: 'Engineer Role' } }))
    expect(result.title).toBe('Engineer Role')
  })

  it('converts salary from major units to minor units (cents)', () => {
    const result = transformDeal(makeRaw({ toVacancy: { salary: 80000, currency: 'EUR' } }))
    expect(result.value?.amount).toBe(8000000)
    expect(result.value?.currency).toBe('EUR')
  })

  it('defaults currency to EUR when not specified', () => {
    const result = transformDeal(makeRaw({ toVacancy: { salary: 50000 } }))
    expect(result.value?.currency).toBe('EUR')
  })

  it('extracts stage_id from toStatusNode object', () => {
    const result = transformDeal(makeRaw({ toStatusNode: { id: 5, name: 'Active' } }))
    expect(result.stage_id).toBe('5')
    expect(result.stage).toBe('Active')
  })

  it('extracts stage from toStatusNode string', () => {
    const result = transformDeal(makeRaw({ toStatusNode: 'Pending' }))
    expect(result.stage).toBe('Pending')
  })

  it('extracts company_id from toCompany object', () => {
    const result = transformDeal(makeRaw({ toCompany: { id: 10 } }))
    expect(result.company_id).toBe('10')
  })

  it('extracts owner_id from toUser object', () => {
    const result = transformDeal(makeRaw({ toUser: { id: 3 } }))
    expect(result.owner_id).toBe('3')
  })

  it('maps publicationEnd to close_date', () => {
    const result = transformDeal(makeRaw({ publicationEnd: '2026-12-31T00:00:00.000Z' }))
    expect(result.close_date).toBe('2026-12-31T00:00:00.000Z')
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('produces output that passes DealSchema.parse', () => {
    const raw = makeRaw({
      toVacancy: { title: 'Backend Engineer', salary: 90000, currency: 'USD' },
      toStatusNode: { id: 2, name: 'Sourcing' },
      toCompany: { id: 15 },
      toUser: { id: 8 },
      publicationEnd: '2026-06-30T00:00:00.000Z',
      dateCreated: '2026-01-01T00:00:00.000Z',
      dateModified: '2026-02-01T00:00:00.000Z',
    })
    expect(() => DealSchema.parse(transformDeal(raw))).not.toThrow()
  })
})

describe('carerix untransformDeal', () => {
  it('wraps title in toVacancy.title', () => {
    const result = untransformDeal({ title: 'Frontend Engineer' })
    expect((result.toVacancy as Record<string, unknown>)?.title).toBe('Frontend Engineer')
  })

  it('converts value minor units to major units in toVacancy.salary', () => {
    const result = untransformDeal({ value: { amount: 5000000, currency: 'USD' } })
    const vacancy = result.toVacancy as Record<string, unknown>
    expect(vacancy.salary).toBe(50000)
    expect(vacancy.currency).toBe('USD')
  })

  it('maps close_date to publicationEnd', () => {
    const result = untransformDeal({ close_date: '2026-12-31T00:00:00.000Z' })
    expect(result.publicationEnd).toBe('2026-12-31T00:00:00.000Z')
  })

  it('maps stage_id to toStatusNode', () => {
    const result = untransformDeal({ stage_id: 'stage_3' })
    expect(result.toStatusNode).toBe('stage_3')
  })

  it('maps company_id to toCompany', () => {
    const result = untransformDeal({ company_id: 'co_5' })
    expect(result.toCompany).toBe('co_5')
  })

  it('omits undefined fields', () => {
    const result = untransformDeal({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
