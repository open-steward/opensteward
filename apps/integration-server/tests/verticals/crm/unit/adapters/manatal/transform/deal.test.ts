import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawManatalJob,
} from '../../../../../../../src/verticals/crm/adapters/manatal/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(overrides: Partial<RawManatalJob> = {}): RawManatalJob {
  return { id: 1, ...overrides }
}

describe('manatal transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 10 })).id).toBe('10')
  })

  it('maps title', () => {
    expect(transformDeal(makeRaw({ title: 'Senior Engineer' })).title).toBe('Senior Engineer')
  })

  it('maps status', () => {
    expect(transformDeal(makeRaw({ status: 'open' })).status).toBe('open')
  })

  it('maps stage', () => {
    expect(transformDeal(makeRaw({ stage: 'Screening' })).stage).toBe('Screening')
  })

  it('maps pipeline to pipeline_id as string', () => {
    expect(transformDeal(makeRaw({ pipeline: 3 })).pipeline_id).toBe('3')
  })

  it('returns undefined pipeline_id when pipeline is null', () => {
    expect(transformDeal(makeRaw({ pipeline: null })).pipeline_id).toBeUndefined()
  })

  it('maps organization to company_id as string', () => {
    expect(transformDeal(makeRaw({ organization: 20 })).company_id).toBe('20')
  })

  it('maps owner to owner_id as string', () => {
    expect(transformDeal(makeRaw({ owner: 5 })).owner_id).toBe('5')
  })

  it('maps close_date to IsoDatetime', () => {
    const result = transformDeal(makeRaw({ close_date: '2024-12-31T00:00:00.000Z' }))
    expect(result.close_date).toBe('2024-12-31T00:00:00.000Z')
  })

  it('maps created_at to IsoDatetime', () => {
    const result = transformDeal(makeRaw({ created_at: '2024-01-15T09:30:00.000Z' }))
    expect(result.created_at).toBe('2024-01-15T09:30:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('passes DealSchema validation', () => {
    const raw: RawManatalJob = {
      id: 1,
      title: 'Senior Engineer',
      status: 'open',
      pipeline: 3,
      stage: 'Screening',
      owner: 5,
      organization: 20,
      close_date: '2024-12-31T00:00:00.000Z',
      created_at: '2024-01-15T09:30:00.000Z',
      updated_at: '2024-02-01T14:20:00.000Z',
    }
    const result = transformDeal(raw)
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('manatal untransformDeal', () => {
  it('maps title', () => {
    expect(untransformDeal({ title: 'Senior Engineer' }).title).toBe('Senior Engineer')
  })

  it('maps pipeline_id to numeric pipeline', () => {
    expect(untransformDeal({ pipeline_id: '3' }).pipeline).toBe(3)
  })

  it('maps company_id to numeric organization', () => {
    expect(untransformDeal({ company_id: '20' }).organization).toBe(20)
  })

  it('maps owner_id to numeric owner', () => {
    expect(untransformDeal({ owner_id: '5' }).owner).toBe(5)
  })

  it('maps close_date', () => {
    expect(untransformDeal({ close_date: '2024-12-31T00:00:00.000Z' }).close_date).toBe(
      '2024-12-31T00:00:00.000Z',
    )
  })
})
