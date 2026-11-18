import { describe, it, expect } from 'vitest'
import { transformActivity } from '../../../../../../../src/verticals/crm/adapters/streak/transform/activity'

describe('streak transformActivity', () => {
  it('throws because Streak does not support a dedicated activity resource', () => {
    expect(() => transformActivity({})).toThrow('Streak does not support')
  })
})
