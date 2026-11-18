import { describe, it, expect } from 'vitest'
import { transformPipeline } from '../../../../../../../src/verticals/crm/adapters/sansan/transform/pipeline'

describe('sansan transformPipeline', () => {
  it('throws because Sansan does not support pipelines', () => {
    expect(() => transformPipeline({})).toThrow('Sansan does not support pipelines')
  })
})
