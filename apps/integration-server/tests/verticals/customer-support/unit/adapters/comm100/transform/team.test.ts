import { describe, it, expect } from 'vitest'
import { TeamSchema } from '../../../../../../../src/verticals/customer-support/schema'
import { transformTeam } from '../../../../../../../src/verticals/customer-support/adapters/comm100/transform/team'
import { DOC_DEPARTMENT } from '../fixtures'

describe('comm100 transformTeam', () => {
  it('maps the documented department example', () => {
    const t = TeamSchema.parse(transformTeam(DOC_DEPARTMENT))
    expect(t.id).toBe('a0831b44-a2d0-4bed-96c4-43f7eb69b095')
    expect(t.name).toBe('markting')
    expect(t.memberCount).toBe(1)
    expect(t.metadata['isAvailableInLiveChat']).toBe('true')
    expect(t.metadata['description']).toBe('markting departments')
  })
})
