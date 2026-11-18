import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawRecruiterflowDeal,
} from '../../../../../../../src/verticals/crm/adapters/recruiterflow/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(overrides: Partial<RawRecruiterflowDeal> = {}): RawRecruiterflowDeal {
  return {
    id: 'job-99',
    name: 'Senior Engineer – Acme',
    client_id: 'client-7',
    stage: 'Sourcing',
    stage_id: 'stage-1',
    pipeline_id: 'pipe-1',
    status: 'open',
    close_date: '2026-03-31T00:00:00.000Z',
    owner_id: 'usr-1',
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-01-20T12:00:00.000Z',
    ...overrides,
  }
}

describe('recruiterflow transformDeal', () => {
  it('maps id', () => {
    expect(transformDeal(makeRaw()).id).toBe('job-99')
  })

  it('maps title from name', () => {
    expect(transformDeal(makeRaw()).title).toBe('Senior Engineer – Acme')
  })

  it('maps company_id from client_id', () => {
    expect(transformDeal(makeRaw()).company_id).toBe('client-7')
  })

  it('maps stage label', () => {
    expect(transformDeal(makeRaw()).stage).toBe('Sourcing')
  })

  it('maps stage_id', () => {
    expect(transformDeal(makeRaw()).stage_id).toBe('stage-1')
  })

  it('maps pipeline_id', () => {
    expect(transformDeal(makeRaw()).pipeline_id).toBe('pipe-1')
  })

  it('maps status', () => {
    expect(transformDeal(makeRaw()).status).toBe('open')
  })

  it('maps owner_id', () => {
    expect(transformDeal(makeRaw()).owner_id).toBe('usr-1')
  })

  it('maps close_date as ISO datetime', () => {
    expect(transformDeal(makeRaw()).close_date).toBe('2026-03-31T00:00:00.000Z')
  })

  it('maps created_at as ISO datetime', () => {
    expect(transformDeal(makeRaw()).created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('maps updated_at as ISO datetime', () => {
    expect(transformDeal(makeRaw()).updated_at).toBe('2026-01-20T12:00:00.000Z')
  })

  it('returns undefined company_id when client_id absent', () => {
    expect(transformDeal(makeRaw({ client_id: undefined })).company_id).toBeUndefined()
  })

  it('passes DealSchema validation', () => {
    expect(() => DealSchema.parse(transformDeal(makeRaw()))).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('untransformDeal round-trips title to name', () => {
    expect(untransformDeal({ title: 'New Job' }).name).toBe('New Job')
  })

  it('untransformDeal maps company_id to client_id', () => {
    expect(untransformDeal({ company_id: 'client-7' }).client_id).toBe('client-7')
  })
})
