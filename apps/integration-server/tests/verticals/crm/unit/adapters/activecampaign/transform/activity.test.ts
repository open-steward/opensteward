import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity, type RawActiveCampaignTask } from '../../../../../../../src/verticals/crm/adapters/activecampaign/transform/activity'

function makeRaw(overrides: Partial<RawActiveCampaignTask> = {}): RawActiveCampaignTask {
  return { id: '1', ...overrides }
}

describe('activecampaign transformActivity', () => {
  it('maps id', () => {
    expect(transformActivity(makeRaw()).id).toBe('1')
  })

  it('sets type to task', () => {
    expect(transformActivity(makeRaw()).type).toBe('task')
  })

  it('maps subject from title', () => {
    expect(transformActivity(makeRaw({ title: 'Call' })).subject).toBe('Call')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('untransformActivity maps subject back to title', () => {
    const result = untransformActivity({ subject: 'Demo', note: 'details' })
    expect(result.title).toBe('Demo')
    expect(result.note).toBe('details')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
