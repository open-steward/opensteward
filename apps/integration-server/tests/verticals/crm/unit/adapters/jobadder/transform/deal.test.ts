import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawJobAdderJob,
} from '../../../../../../../src/verticals/crm/adapters/jobadder/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(overrides: Partial<RawJobAdderJob> = {}): RawJobAdderJob {
  return { jobId: 1, ...overrides }
}

describe('jobadder transformDeal', () => {
  it('maps jobId to string id', () => {
    expect(transformDeal(makeRaw({ jobId: 42 })).id).toBe('42')
  })

  it('maps jobTitle to title', () => {
    expect(transformDeal(makeRaw({ jobTitle: 'Senior Engineer' })).title).toBe('Senior Engineer')
  })

  it('prefers rateHigh over rateLow for value amount', () => {
    const result = transformDeal(
      makeRaw({ salary: { rateLow: 50000, rateHigh: 80000, currency: 'USD' } }),
    )
    expect(result.value?.amount).toBe(80000)
    expect(result.value?.currency).toBe('USD')
  })

  it('falls back to rateLow when rateHigh is absent', () => {
    const result = transformDeal(makeRaw({ salary: { rateLow: 50000, currency: 'GBP' } }))
    expect(result.value?.amount).toBe(50000)
    expect(result.value?.currency).toBe('GBP')
  })

  it('maps status.active === false to status "closed"', () => {
    const result = transformDeal(makeRaw({ status: { active: false, name: 'Filled' } }))
    expect(result.status).toBe('closed')
  })

  it('uses status.name as status when active is not false', () => {
    const result = transformDeal(makeRaw({ status: { active: true, name: 'Open' } }))
    expect(result.status).toBe('Open')
  })

  it('maps status.name to stage', () => {
    expect(transformDeal(makeRaw({ status: { name: 'Shortlist' } })).stage).toBe('Shortlist')
  })

  it('maps status.statusId to stage_id', () => {
    expect(transformDeal(makeRaw({ status: { statusId: 3 } })).stage_id).toBe('3')
  })

  it('maps company.companyId to company_id', () => {
    expect(transformDeal(makeRaw({ company: { companyId: 5 } })).company_id).toBe('5')
  })

  it('maps contact.contactId to contact_ids array', () => {
    expect(transformDeal(makeRaw({ contact: { contactId: 10 } })).contact_ids).toEqual(['10'])
  })

  it('maps owner.userId to owner_id', () => {
    expect(transformDeal(makeRaw({ owner: { userId: 7 } })).owner_id).toBe('7')
  })

  it('maps expiresAt to close_date', () => {
    expect(transformDeal(makeRaw({ expiresAt: '2026-06-01T00:00:00.000Z' })).close_date).toBe(
      '2026-06-01T00:00:00.000Z',
    )
  })

  it('maps createdAt to created_at', () => {
    expect(transformDeal(makeRaw({ createdAt: '2026-01-01T00:00:00.000Z' })).created_at).toBe(
      '2026-01-01T00:00:00.000Z',
    )
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces a DealSchema-valid result', () => {
    const raw = makeRaw({
      jobId: 1,
      jobTitle: 'Senior Engineer',
      salary: { rateLow: 50000, rateHigh: 80000, currency: 'USD' },
      status: { statusId: 3, name: 'Open', active: true },
      company: { companyId: 5 },
      contact: { contactId: 10 },
      owner: { userId: 7 },
      expiresAt: '2026-06-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    })
    expect(() => DealSchema.parse(transformDeal(raw))).not.toThrow()
  })
})

describe('jobadder untransformDeal', () => {
  it('maps title to jobTitle', () => {
    expect(untransformDeal({ title: 'Engineer' }).jobTitle).toBe('Engineer')
  })

  it('maps value to salary with rateLow and rateHigh', () => {
    const result = untransformDeal({ value: { amount: 80000, currency: 'USD' } })
    const salary = result.salary as Record<string, unknown>
    expect(salary.rateLow).toBe(80000)
    expect(salary.rateHigh).toBe(80000)
    expect(salary.currency).toBe('USD')
  })

  it('maps close_date to expiresAt', () => {
    expect(untransformDeal({ close_date: '2026-06-01T00:00:00.000Z' }).expiresAt).toBe(
      '2026-06-01T00:00:00.000Z',
    )
  })

  it('round-trips title and close_date', () => {
    const canonical = transformDeal(
      makeRaw({ jobTitle: 'Engineer', expiresAt: '2026-06-01T00:00:00.000Z' }),
    )
    const wire = untransformDeal(canonical)
    expect(wire.jobTitle).toBe('Engineer')
    expect(wire.expiresAt).toBe('2026-06-01T00:00:00.000Z')
  })
})
