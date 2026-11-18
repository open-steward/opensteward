import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawFollowUpBossDeal,
} from '../../../../../../../src/verticals/crm/adapters/follow-up-boss/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(overrides: Partial<RawFollowUpBossDeal> = {}): RawFollowUpBossDeal {
  return { id: 1, ...overrides }
}

describe('follow-up-boss transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 77 })).id).toBe('77')
  })

  it('maps name to title', () => {
    expect(transformDeal(makeRaw({ name: 'Big Deal' })).title).toBe('Big Deal')
  })

  it('falls back to empty string when name absent', () => {
    expect(transformDeal(makeRaw()).title).toBe('')
  })

  it('converts price in whole dollars to minor units (cents)', () => {
    // FUB stores whole dollars; canonical is cents
    const result = transformDeal(makeRaw({ price: 450000 }))
    expect(result.value?.amount).toBe(45000000)
    expect(result.value?.currency).toBe('USD')
  })

  it('hardcodes USD currency', () => {
    expect(transformDeal(makeRaw({ price: 100 })).value?.currency).toBe('USD')
  })

  it('omits value when price absent', () => {
    expect(transformDeal(makeRaw()).value).toBeUndefined()
  })

  it('maps status field', () => {
    expect(transformDeal(makeRaw({ status: 'active' })).status).toBe('active')
  })

  it('maps stageId to stage_id string', () => {
    expect(transformDeal(makeRaw({ stageId: 3 })).stage_id).toBe('3')
  })

  it('maps pipelineId to pipeline_id string', () => {
    expect(transformDeal(makeRaw({ pipelineId: 7 })).pipeline_id).toBe('7')
  })

  it('wraps personId in contact_ids array', () => {
    expect(transformDeal(makeRaw({ personId: 101 })).contact_ids).toEqual(['101'])
  })

  it('prefers assignedTo over assignedUserId for owner_id', () => {
    const result = transformDeal(makeRaw({ assignedTo: 'agent@example.com', assignedUserId: 5 }))
    expect(result.owner_id).toBe('agent@example.com')
  })

  it('maps projectedCloseDate directly to close_date', () => {
    expect(transformDeal(makeRaw({ projectedCloseDate: '2024-03-31' })).close_date).toBe(
      '2024-03-31',
    )
  })

  it('maps created/updated timestamps directly', () => {
    const result = transformDeal(
      makeRaw({ created: '2023-11-01T10:00:00.000Z', updated: '2023-11-14T22:00:00.000Z' }),
    )
    expect(result.created_at).toBe('2023-11-01T10:00:00.000Z')
    expect(result.updated_at).toBe('2023-11-14T22:00:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('passes DealSchema validation with full input', () => {
    const raw: RawFollowUpBossDeal = {
      id: 77,
      name: 'Big Deal',
      personId: 101,
      stageId: 3,
      pipelineId: 7,
      price: 450000,
      projectedCloseDate: '2024-03-31T00:00:00.000Z',
      status: 'active',
      assignedTo: 'agent@example.com',
      created: '2023-11-01T10:00:00.000Z',
      updated: '2023-11-14T22:00:00.000Z',
    }
    const result = transformDeal(raw)
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('follow-up-boss untransformDeal', () => {
  it('maps title back to name', () => {
    expect(untransformDeal({ title: 'Big Deal' }).name).toBe('Big Deal')
  })

  it('converts canonical cents back to whole dollars for price', () => {
    // 45000000 cents = $450,000
    const result = untransformDeal({ value: { amount: 45000000, currency: 'USD' } })
    expect(result.price).toBe(450000)
  })

  it('maps stage_id back to stageId', () => {
    expect(untransformDeal({ stage_id: '3' }).stageId).toBe('3')
  })

  it('maps pipeline_id back to pipelineId', () => {
    expect(untransformDeal({ pipeline_id: '7' }).pipelineId).toBe('7')
  })

  it('maps close_date back to projectedCloseDate', () => {
    expect(untransformDeal({ close_date: '2024-03-31T00:00:00.000Z' }).projectedCloseDate).toBe(
      '2024-03-31T00:00:00.000Z',
    )
  })

  it('maps owner_id back to assignedTo', () => {
    expect(untransformDeal({ owner_id: 'agent@example.com' }).assignedTo).toBe('agent@example.com')
  })

  it('maps first contact_ids entry to personId', () => {
    expect(untransformDeal({ contact_ids: ['101', '102'] }).personId).toBe('101')
  })

  it('omits unset fields', () => {
    const result = untransformDeal({})
    expect(result).not.toHaveProperty('name')
    expect(result).not.toHaveProperty('price')
  })
})
