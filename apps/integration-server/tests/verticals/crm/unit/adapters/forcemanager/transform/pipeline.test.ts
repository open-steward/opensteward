import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline } from '../../../../../../../src/verticals/crm/adapters/forcemanager/transform/pipeline'
import {
  OPPORTUNITY_STATUS,
  OPPORTUNITY_STATUSES,
  OPPORTUNITY_TYPE,
  OPPORTUNITY_TYPES,
} from '../fixtures'

describe('forcemanager transformPipeline (Opportunity Type + its Opportunity Statuses)', () => {
  // The documented GET /opportunityStatuses/{ID} example has idParent 1, the id of
  // the first documented Opportunity Type ("Sales Pipeline").
  const statuses = [...OPPORTUNITY_STATUSES, OPPORTUNITY_STATUS]

  it('parses with the canonical schema', () => {
    for (const t of [...OPPORTUNITY_TYPES, OPPORTUNITY_TYPE]) {
      expect(() => PipelineSchema.parse(transformPipeline(t, statuses))).not.toThrow()
    }
  })

  it('maps the type and attaches only the statuses whose idParent is its id', () => {
    const out = transformPipeline(OPPORTUNITY_TYPES[0]!, statuses)
    expect(out).toMatchObject({
      id: '1',
      name: 'Sales Pipeline',
      is_active: true,
      created_at: '2021-11-29T17:16:04.900Z',
      stages: [{ id: '478', name: 'First visit', order: 5 }],
    })
    expect(out.updated_at).toBeUndefined()
    expect(out.metadata).toBe(OPPORTUNITY_TYPES[0])
  })

  it('attaches no status with a null idParent', () => {
    expect(transformPipeline(OPPORTUNITY_TYPES[1]!, statuses).stages).toEqual([])
  })

  it('orders stages by the documented order, ties in upstream order, and drops deleted ones', () => {
    const mk = (id: number, order: number, deleted = false) => ({
      ...OPPORTUNITY_STATUS,
      id,
      order,
      deleted,
    })
    const out = transformPipeline(OPPORTUNITY_TYPES[0]!, [
      mk(1, 2),
      mk(2, 0),
      mk(3, 2),
      mk(4, 1, true),
      mk(5, 1),
    ])
    expect(out.stages!.map((s) => s.id)).toEqual(['2', '5', '1', '3'])
  })

  it('reads deleted as inactive', () => {
    expect(transformPipeline({ ...OPPORTUNITY_TYPE, deleted: true }, []).is_active).toBe(false)
  })

  it('throws on a type with no id', () => {
    expect(() => transformPipeline({ ...OPPORTUNITY_TYPE, id: null }, [])).toThrow(/no id/)
  })
})
