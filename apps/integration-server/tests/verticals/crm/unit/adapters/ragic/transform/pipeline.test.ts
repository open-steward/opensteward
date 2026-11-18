import { describe, it, expect } from 'vitest'
import { transformPipeline } from '../../../../../../../src/verticals/crm/adapters/ragic/transform/pipeline'

describe('ragic transformPipeline', () => {
  it('throws because Ragic does not support pipelines', () => {
    expect(() => transformPipeline({})).toThrow('Ragic')
  })
})
