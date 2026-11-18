/**
 * Fixtures are the property examples of `OpportunityPipelineCollectionItem`
 * and the pipeline Step schema in the Sellsy API v2 OpenAPI spec
 * (https://docs.sellsy.com/api/v2/dist/sellsy.v2.latest.yaml).
 */
import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline } from '../../../../../../../src/verticals/crm/adapters/sellsy/transform/pipeline'
import type {
  RawSellsyPipeline,
  RawSellsyPipelineStep,
} from '../../../../../../../src/verticals/crm/adapters/sellsy/transform/pipeline'

// OpportunityPipelineCollectionItem examples: id 1, name 'New website',
// is_default true, step 2 ("Count of steps"), rank 2.
function makeRaw(overrides: Partial<RawSellsyPipeline> = {}): RawSellsyPipeline {
  return { id: 1, name: 'New website', is_default: true, step: 2, rank: 2, ...overrides }
}

// Step examples: id 1, name 'New website', probability 75, rank 2.
const step: RawSellsyPipelineStep = { id: 1, name: 'New website', probability: 75, rank: 2 }

describe('sellsy transformPipeline', () => {
  it('maps the documented pipeline fields and parses as a Pipeline', () => {
    const raw = makeRaw()
    const result = PipelineSchema.parse(transformPipeline(raw))
    expect(result.id).toBe('1')
    expect(result.name).toBe('New website')
    expect(result.metadata).toEqual(raw)
  })

  it('leaves stages out when the steps were not fetched, and claims no is_active', () => {
    const result = transformPipeline(makeRaw())
    expect(result.stages).toBeUndefined()
    expect(result.is_active).toBeUndefined()
  })

  it('maps steps to stages: rank → order, probability → win_probability', () => {
    const result = PipelineSchema.parse(
      transformPipeline(makeRaw(), [step, { id: 2, name: 'Won', probability: 100, rank: 3 }]),
    )
    expect(result.stages).toEqual([
      { id: '1', name: 'New website', order: 2, win_probability: 75 },
      { id: '2', name: 'Won', order: 3, win_probability: 100 },
    ])
  })

  it('an empty steps list is an empty stages list', () => {
    expect(transformPipeline(makeRaw(), []).stages).toEqual([])
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })
})
