import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity, type RawZohoTask } from '../../../../../../../src/verticals/crm/adapters/zoho-crm/transform/activity'

function makeRaw(overrides: Partial<RawZohoTask> = {}): RawZohoTask {
  return { id: 'ZOACT1', ...overrides }
}

describe('zoho-crm transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw()).id).toBe('ZOACT1')
  })

  it('type is always "task"', () => {
    expect(transformActivity(makeRaw()).type).toBe('task')
  })

  it('marks done when Status is Completed', () => {
    expect(transformActivity(makeRaw({ Status: 'Completed' })).done).toBe(true)
    expect(transformActivity(makeRaw({ Status: 'Not Started' })).done).toBe(false)
  })

  it('maps Subject to subject', () => {
    expect(transformActivity(makeRaw({ Subject: 'Send proposal' })).subject).toBe('Send proposal')
  })

  it('maps Who_Id.id to contact_id', () => {
    expect(transformActivity(makeRaw({ Who_Id: { id: 'C1' } })).contact_id).toBe('C1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('zoho-crm untransformActivity', () => {
  it('maps subject to Subject', () => {
    expect(untransformActivity({ subject: 'Call' }).Subject).toBe('Call')
  })

  it('maps done to Status string', () => {
    expect(untransformActivity({ done: true }).Status).toBe('Completed')
    expect(untransformActivity({ done: false }).Status).toBe('Not Started')
  })
})
