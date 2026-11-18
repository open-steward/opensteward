/**
 * Capsule pipeline transform. Fixtures are the documented examples:
 *
 * https://developer.capsulecrm.com/v2/operations/Pipeline (List pipelines):
 *   { "pipelines" : [ { "id" : 11589, "name" : "SMB clients",
 *     "description" : "Process for small and medium-sized businesses" },
 *     { "id" : 11588, "name" : "Sales Pipeline" } ] }
 *
 * https://developer.capsulecrm.com/v2/operations/Milestone (List milestones by pipeline):
 *   { "id" : 1, "name" : "Prospect", "description" : "The potential buyer has shared a goal
 *     or a problem with you", "complete" : false, "probability" : 5,
 *     "pipeline" : { "name" : "SMB clients", "id" : 10 }, "daysUntilStale" : 10,
 *     "createdAt" : "2021-09-16T14:52:44Z", "updatedAt" : "2021-09-16T14:52:44Z" }
 *
 * https://developer.capsulecrm.com/v2/models/pipeline:
 *   "deleted Boolean Indicates whether this pipeline is archived."
 */
import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawCapsuleMilestone,
  type RawCapsulePipeline,
} from '../../../../../../../src/verticals/crm/adapters/capsule/transform/pipeline'

const SMB: RawCapsulePipeline = {
  id: 11589,
  name: 'SMB clients',
  description: 'Process for small and medium-sized businesses',
}

const PROSPECT: RawCapsuleMilestone = {
  id: 1,
  name: 'Prospect',
  description: 'The potential buyer has shared a goal or a problem with you',
  complete: false,
  probability: 5,
  pipeline: { name: 'SMB clients', id: 10 },
  daysUntilStale: 10,
  createdAt: '2021-09-16T14:52:44Z',
  updatedAt: '2021-09-16T14:52:44Z',
}

const BID: RawCapsuleMilestone = {
  id: 2,
  name: 'Bid',
  complete: false,
  probability: 10,
  pipeline: { name: 'SMB clients', id: 10 },
  daysUntilStale: 12,
  createdAt: '2021-09-16T09:21:37Z',
  updatedAt: '2021-09-16T09:21:37Z',
}

describe('capsule transformPipeline', () => {
  it('uses the real pipeline id and name, never a synthetic default', () => {
    const p = PipelineSchema.parse(transformPipeline(SMB, []))
    expect(p.id).toBe('11589')
    expect(p.name).toBe('SMB clients')
  })

  it('maps each milestone to a stage with its id, name and probability', () => {
    const p = PipelineSchema.parse(transformPipeline(SMB, [PROSPECT, BID]))
    expect(p.stages).toEqual([
      { id: '1', name: 'Prospect', win_probability: 5 },
      { id: '2', name: 'Bid', win_probability: 10 },
    ])
  })

  it('reads is_active from the documented deleted flag only', () => {
    expect(PipelineSchema.parse(transformPipeline({ ...SMB, deleted: true }, [])).is_active).toBe(
      false,
    )
    expect(PipelineSchema.parse(transformPipeline({ ...SMB, deleted: false }, [])).is_active).toBe(
      true,
    )
    expect(PipelineSchema.parse(transformPipeline(SMB, [])).is_active).toBeUndefined()
  })

  it('maps createdAt / updatedAt', () => {
    const p = PipelineSchema.parse(
      transformPipeline(
        { ...SMB, createdAt: '2021-09-16T14:52:44Z', updatedAt: '2021-09-17T10:00:00Z' },
        [],
      ),
    )
    expect(p.created_at).toBe('2021-09-16T14:52:44Z')
    expect(p.updated_at).toBe('2021-09-17T10:00:00Z')
  })

  it('keeps the raw pipeline and milestones in metadata', () => {
    const p = PipelineSchema.parse(transformPipeline(SMB, [PROSPECT]))
    expect(p.metadata).toEqual({ pipeline: SMB, milestones: [PROSPECT] })
  })
})
