import { describe, it, expect } from 'vitest'
import { buildSyntheticPipeline, buildSyntheticPipelines } from '../../../../../../../src/verticals/crm/adapters/vtiger/transform/pipeline'

describe('vtiger buildSyntheticPipeline', () => {
  it('returns a pipeline object', () => {
    const pipeline = buildSyntheticPipeline()
    expect(pipeline).toBeDefined()
    expect(pipeline.id).toBeTruthy()
    expect(pipeline.name).toBeTruthy()
  })

  it('pipeline has stages array', () => {
    expect(Array.isArray(buildSyntheticPipeline().stages)).toBe(true)
  })

  it('is active', () => {
    expect(buildSyntheticPipeline().is_active).toBe(true)
  })
})

describe('vtiger buildSyntheticPipelines', () => {
  it('returns an array with one pipeline', () => {
    const pipelines = buildSyntheticPipelines()
    expect(Array.isArray(pipelines)).toBe(true)
    expect(pipelines.length).toBe(1)
  })
})
