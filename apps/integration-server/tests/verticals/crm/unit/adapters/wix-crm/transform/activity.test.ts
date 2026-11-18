import { describe, it, expect } from 'vitest'
import { transformActivity } from '../../../../../../../src/verticals/crm/adapters/wix-crm/transform/activity'

describe('wix-crm transformActivity', () => {
  it('throws because not implemented', () => {
    expect(() => transformActivity({} as never)).toThrow('not implemented')
  })
})
