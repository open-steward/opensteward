import { describe, it, expect } from 'vitest'
import { transformActivity } from '../../../../../../../src/verticals/crm/adapters/planhat/transform/activity'

describe('planhat transformActivity', () => {
  it('throws because Planhat does not support activities', () => {
    expect(() => transformActivity({})).toThrow('Planhat')
  })
})
