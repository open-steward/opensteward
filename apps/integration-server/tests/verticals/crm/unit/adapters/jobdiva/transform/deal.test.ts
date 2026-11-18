import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawJobdivaJob,
} from '../../../../../../../src/verticals/crm/adapters/jobdiva/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(overrides: Partial<RawJobdivaJob> = {}): RawJobdivaJob {
  return { jobid: '1', ...overrides }
}

describe('jobdiva transformDeal', () => {
  it('maps jobid to string id (primary)', () => {
    expect(transformDeal(makeRaw({ jobid: '42' })).id).toBe('42')
  })

  it('falls back to id when jobid absent', () => {
    expect(transformDeal({ id: '7' }).id).toBe('7')
  })

  it('maps jobtitle to title', () => {
    expect(transformDeal(makeRaw({ jobtitle: 'Senior Engineer' })).title).toBe('Senior Engineer')
  })

  it('falls back to title field when jobtitle absent', () => {
    expect(transformDeal({ title: 'Engineer' }).title).toBe('Engineer')
  })

  it('maps clientid to company_id (primary)', () => {
    expect(transformDeal(makeRaw({ clientid: '5' })).company_id).toBe('5')
  })

  it('falls back to companyid when clientid absent', () => {
    expect(transformDeal({ companyid: '8' }).company_id).toBe('8')
  })

  it('maps status', () => {
    expect(transformDeal(makeRaw({ status: 'Open' })).status).toBe('Open')
  })

  it('maps stage', () => {
    expect(transformDeal(makeRaw({ stage: 'Shortlist' })).stage).toBe('Shortlist')
  })

  it('maps stageid to stage_id', () => {
    expect(transformDeal(makeRaw({ stageid: '3' })).stage_id).toBe('3')
  })

  it('maps billrate to value.amount with default currency USD', () => {
    const result = transformDeal(makeRaw({ billrate: 95, currency: 'USD' }))
    expect(result.value?.amount).toBe(95)
    expect(result.value?.currency).toBe('USD')
  })

  it('maps ownerid to owner_id', () => {
    expect(transformDeal(makeRaw({ ownerid: '7' })).owner_id).toBe('7')
  })

  it('maps enddate to close_date', () => {
    expect(transformDeal(makeRaw({ enddate: '2026-06-01T00:00:00.000Z' })).close_date).toBe(
      '2026-06-01T00:00:00.000Z',
    )
  })

  it('maps createdat to created_at', () => {
    expect(transformDeal(makeRaw({ createdat: '2026-01-01T00:00:00.000Z' })).created_at).toBe(
      '2026-01-01T00:00:00.000Z',
    )
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces a DealSchema-valid result', () => {
    const raw = makeRaw({
      jobid: '1',
      jobtitle: 'Senior Engineer',
      clientid: '5',
      status: 'Open',
      stage: 'Shortlist',
      stageid: '3',
      billrate: 95,
      currency: 'USD',
      ownerid: '7',
      enddate: '2026-06-01T00:00:00.000Z',
      createdat: '2026-01-01T00:00:00.000Z',
      modifiedat: '2026-01-02T00:00:00.000Z',
    })
    expect(() => DealSchema.parse(transformDeal(raw))).not.toThrow()
  })
})

describe('jobdiva untransformDeal', () => {
  it('maps title to jobtitle', () => {
    expect(untransformDeal({ title: 'Engineer' }).jobtitle).toBe('Engineer')
  })

  it('maps company_id to clientid', () => {
    expect(untransformDeal({ company_id: '5' }).clientid).toBe('5')
  })

  it('maps status', () => {
    expect(untransformDeal({ status: 'Open' }).status).toBe('Open')
  })

  it('maps value.amount to billrate', () => {
    expect(untransformDeal({ value: { amount: 95, currency: 'USD' } }).billrate).toBe(95)
  })

  it('maps close_date to enddate', () => {
    expect(untransformDeal({ close_date: '2026-06-01T00:00:00.000Z' }).enddate).toBe(
      '2026-06-01T00:00:00.000Z',
    )
  })

  it('round-trips title and billrate', () => {
    const canonical = transformDeal(
      makeRaw({ jobtitle: 'Engineer', billrate: 95, currency: 'USD' }),
    )
    const wire = untransformDeal(canonical)
    expect(wire.jobtitle).toBe('Engineer')
    expect(wire.billrate).toBe(95)
  })
})
