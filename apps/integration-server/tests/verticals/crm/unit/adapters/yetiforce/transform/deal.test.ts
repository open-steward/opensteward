/**
 * SSalesProcesses raw data (`x-raw-data: 1`, Record_Raw_Details in
 * WebservicePremium.json) with the SSalesProcesses field names of
 * YetiForce's install schema.
 */
import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawYetiForceOpportunity,
} from '../../../../../../../src/verticals/crm/adapters/yetiforce/transform/deal'

function makeRaw(overrides: RawYetiForceOpportunity = {}): RawYetiForceOpportunity {
  return {
    id: 152,
    subject: 'Fleet renewal',
    ssalesprocesses_status: 'PLL_NEGOTIATIONS',
    related_to: 117,
    assigned_user_id: 1,
    estimated: '12000.00',
    estimated_date: '2026-03-31',
    probability: '60.00',
    createdtime: '2026-01-15 09:30:00',
    modifiedtime: '2026-02-01 14:20:00',
    ...overrides,
  }
}

describe('yetiforce transformDeal', () => {
  it('maps the documented fields and parses as a canonical Deal', () => {
    const d = DealSchema.parse(transformDeal('152', makeRaw(), 'UTC'))
    expect(d).toMatchObject({
      id: '152',
      title: 'Fleet renewal',
      stage: 'PLL_NEGOTIATIONS',
      stage_id: 'PLL_NEGOTIATIONS',
      pipeline_id: 'ssalesprocesses_status',
      company_id: '117',
      owner_id: '1',
      close_date: '2026-03-31T00:00:00.000Z',
      probability: 60,
      created_at: '2026-01-15T09:30:00.000Z',
      updated_at: '2026-02-01T14:20:00.000Z',
    })
  })

  it('leaves value out: the record carries no currency code', () => {
    expect(transformDeal('152', makeRaw(), 'UTC').value).toBeUndefined()
  })

  it('leaves the pipeline out when the record has no status', () => {
    const d = transformDeal('152', makeRaw({ ssalesprocesses_status: '' }), 'UTC')
    expect(d.stage).toBeUndefined()
    expect(d.pipeline_id).toBeUndefined()
  })

  it('throws instead of inventing a title when subject is missing', () => {
    expect(() => transformDeal('152', makeRaw({ subject: undefined }), 'UTC')).toThrow(/subject/)
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal('152', raw, 'UTC').metadata).toBe(raw)
  })
})

describe('yetiforce untransformDeal', () => {
  it('maps title to opportunityname', () => {
    expect(untransformDeal({ title: 'Deal A' }).opportunityname).toBe('Deal A')
  })
})
