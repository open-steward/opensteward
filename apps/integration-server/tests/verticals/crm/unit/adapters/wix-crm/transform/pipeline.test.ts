import { describe, it, expect } from 'vitest'
import { transformPipeline } from '../../../../../../../src/verticals/crm/adapters/wix-crm/transform/pipeline'

describe('wix-crm transformPipeline', () => {
  it('throws because not implemented', () => {
    expect(() => transformPipeline({} as never)).toThrow('not implemented')
  })
})
