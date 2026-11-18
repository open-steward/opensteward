import { describe, it, expect } from 'vitest'
import { transformPipeline } from '../../../../../../../src/verticals/crm/adapters/planhat/transform/pipeline'

describe('planhat transformPipeline', () => {
  it('throws because Planhat does not support pipelines', () => {
    expect(() => transformPipeline({})).toThrow('Planhat')
  })
})
