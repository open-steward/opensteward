import { describe, it, expect } from 'vitest'
import {
  buildSyntheticPipeline,
  buildSyntheticPipelines,
} from '../../../../../../../src/verticals/crm/adapters/oracle-cx/transform/pipeline'

describe('oracle-cx buildSyntheticPipeline', () => {
  it('returns a pipeline with is_active true', () => {
    expect(buildSyntheticPipeline().is_active).toBe(true)
  })

  it('returns a pipeline with at least one stage', () => {
    expect(buildSyntheticPipeline().stages?.length).toBeGreaterThan(0)
  })

  it('each stage has an id and name', () => {
    const stages = buildSyntheticPipeline().stages
    if (stages === undefined) throw new Error('expected stages to be defined')
    for (const stage of stages) {
      expect(stage.id).toBeTruthy()
      expect(stage.name).toBeTruthy()
    }
  })
})

describe('oracle-cx buildSyntheticPipelines', () => {
  it('returns an array with one pipeline', () => {
    expect(buildSyntheticPipelines()).toHaveLength(1)
  })
})
