import { describe, it, expect } from 'vitest'
import { transformPipeline } from '../../../../../../../src/verticals/crm/adapters/kintone/transform/pipeline'

describe('kintone transformPipeline', () => {
  it('throws because Kintone does not support pipelines', () => {
    expect(() => transformPipeline({})).toThrow('Kintone does not support pipelines')
  })
})
