import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawTribeCrmTask,
} from '../../../../../../../src/verticals/crm/adapters/tribe-crm/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawTribeCrmTask> = {}): RawTribeCrmTask {
  return { Id: 1, ...overrides }
}

describe('tribe-crm transformActivity', () => {
  it('maps Id to string id', () => {
    expect(transformActivity(makeRaw({ Id: 99 })).id).toBe('99')
  })

  it('maps ActivityType to type', () => {
    const result = transformActivity(makeRaw({ ActivityType: 'call' }))
    expect(result.type).toBe('call')
  })

  it('maps Subject to subject', () => {
    const result = transformActivity(makeRaw({ Subject: 'Follow up' }))
    expect(result.subject).toBe('Follow up')
  })

  it('maps Description to note', () => {
    const result = transformActivity(makeRaw({ Description: 'Meeting agenda' }))
    expect(result.note).toBe('Meeting agenda')
  })

  it('maps RelationId to contact_id', () => {
    const result = transformActivity(makeRaw({ RelationId: 12 }))
    expect(result.contact_id).toBe('12')
  })

  it('maps OrganisationId to company_id', () => {
    const result = transformActivity(makeRaw({ OrganisationId: 23 }))
    expect(result.company_id).toBe('23')
  })

  it('maps ActivityId to deal_id', () => {
    const result = transformActivity(makeRaw({ ActivityId: 33 }))
    expect(result.deal_id).toBe('33')
  })

  it('maps OwnerId to owner_id', () => {
    const result = transformActivity(makeRaw({ OwnerId: 5 }))
    expect(result.owner_id).toBe('5')
  })

  it('maps DueDate to due_date', () => {
    const result = transformActivity(makeRaw({ DueDate: '2026-03-01T10:00:00.000Z' }))
    expect(result.due_date).toBe('2026-03-01T10:00:00.000Z')
  })

  it('maps IsCompleted to done', () => {
    expect(transformActivity(makeRaw({ IsCompleted: true })).done).toBe(true)
    expect(transformActivity(makeRaw({ IsCompleted: false })).done).toBe(false)
  })

  it('maps Duration to duration_minutes', () => {
    const result = transformActivity(makeRaw({ Duration: 45 }))
    expect(result.duration_minutes).toBe(45)
  })

  it('maps CreatedOn to created_at', () => {
    const result = transformActivity(makeRaw({ CreatedOn: '2026-01-15T09:30:00.000Z' }))
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('passes ActivitySchema validation', () => {
    const raw = makeRaw({
      Id: 99,
      ActivityType: 'call',
      Subject: 'Follow up',
      Description: 'Meeting agenda',
      RelationId: 12,
      OrganisationId: 23,
      ActivityId: 33,
      OwnerId: 5,
      DueDate: '2026-03-01T10:00:00.000Z',
      IsCompleted: false,
      Duration: 30,
      CreatedOn: '2026-01-15T09:30:00.000Z',
      ModifiedOn: '2026-02-01T14:20:00.000Z',
    })
    expect(() => ActivitySchema.parse(transformActivity(raw))).not.toThrow()
  })
})

describe('tribe-crm untransformActivity', () => {
  it('maps subject back to Subject', () => {
    const result = untransformActivity({ subject: 'Follow up' })
    expect(result.Subject).toBe('Follow up')
  })

  it('maps note back to Description', () => {
    const result = untransformActivity({ note: 'Meeting agenda' })
    expect(result.Description).toBe('Meeting agenda')
  })

  it('maps type back to ActivityType', () => {
    const result = untransformActivity({ type: 'call' })
    expect(result.ActivityType).toBe('call')
  })

  it('maps contact_id back to RelationId', () => {
    const result = untransformActivity({ contact_id: '12' })
    expect(result.RelationId).toBe('12')
  })

  it('maps deal_id back to ActivityId', () => {
    const result = untransformActivity({ deal_id: '33' })
    expect(result.ActivityId).toBe('33')
  })

  it('maps done back to IsCompleted', () => {
    const result = untransformActivity({ done: true })
    expect(result.IsCompleted).toBe(true)
  })

  it('maps duration_minutes back to Duration', () => {
    const result = untransformActivity({ duration_minutes: 45 })
    expect(result.Duration).toBe(45)
  })

  it('omits undefined fields', () => {
    const result = untransformActivity({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
