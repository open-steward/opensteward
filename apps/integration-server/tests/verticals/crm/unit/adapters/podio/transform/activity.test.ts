import { describe, it, expect } from 'vitest'
import { transformActivity } from '../../../../../../../src/verticals/crm/adapters/podio/transform/activity'

describe('podio transformActivity', () => {
  it('throws because Podio activity is not implemented', () => {
    expect(() => transformActivity({})).toThrow()
  })
})
