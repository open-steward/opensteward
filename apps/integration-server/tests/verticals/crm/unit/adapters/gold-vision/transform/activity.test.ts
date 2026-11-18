import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
  type RawGoldVisionActivity,
} from '../../../../../../../src/verticals/crm/adapters/gold-vision/transform/activity'

function makeRaw(overrides: Partial<RawGoldVisionActivity> = {}): RawGoldVisionActivity {
  return { id: 1, ...overrides }
}

describe('gold-vision transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('returns empty string id when absent', () => {
    expect(transformActivity(makeRaw({ id: undefined })).id).toBe('')
  })

  it('maps plain string type through', () => {
    expect(transformActivity(makeRaw({ type: 'call' })).type).toBe('call')
  })

  it('resolves object type to its summary', () => {
    expect(transformActivity(makeRaw({ type: { summary: 'Call' } })).type).toBe('Call')
  })

  it('defaults type to task when absent', () => {
    expect(transformActivity(makeRaw({ type: undefined })).type).toBe('task')
  })

  it('maps summary to subject', () => {
    expect(transformActivity(makeRaw({ summary: 'Follow up' })).subject).toBe('Follow up')
  })

  it('returns undefined subject when absent', () => {
    expect(transformActivity(makeRaw({ summary: undefined })).subject).toBeUndefined()
  })

  it('maps notes to note', () => {
    expect(transformActivity(makeRaw({ notes: 'Call notes' })).note).toBe('Call notes')
  })

  it('returns undefined note when absent', () => {
    expect(transformActivity(makeRaw({ notes: undefined })).note).toBeUndefined()
  })

  it('maps contactId to contact_id string', () => {
    expect(transformActivity(makeRaw({ contactId: 7 })).contact_id).toBe('7')
  })

  it('returns undefined contact_id when absent', () => {
    expect(transformActivity(makeRaw({ contactId: undefined })).contact_id).toBeUndefined()
  })

  it('maps accountId to company_id string', () => {
    expect(transformActivity(makeRaw({ accountId: 8 })).company_id).toBe('8')
  })

  it('returns undefined company_id when absent', () => {
    expect(transformActivity(makeRaw({ accountId: undefined })).company_id).toBeUndefined()
  })

  it('maps opportunityId to deal_id string', () => {
    expect(transformActivity(makeRaw({ opportunityId: 9 })).deal_id).toBe('9')
  })

  it('returns undefined deal_id when absent', () => {
    expect(transformActivity(makeRaw({ opportunityId: undefined })).deal_id).toBeUndefined()
  })

  it('maps ownerId to owner_id string', () => {
    expect(transformActivity(makeRaw({ ownerId: 3 })).owner_id).toBe('3')
  })

  it('returns undefined owner_id when absent', () => {
    expect(transformActivity(makeRaw({ ownerId: undefined })).owner_id).toBeUndefined()
  })

  it('maps completed to done', () => {
    expect(transformActivity(makeRaw({ completed: true })).done).toBe(true)
  })

  it('returns undefined done when absent', () => {
    expect(transformActivity(makeRaw({ completed: undefined })).done).toBeUndefined()
  })

  it('maps numeric durationMinutes through', () => {
    expect(transformActivity(makeRaw({ durationMinutes: 60 })).duration_minutes).toBe(60)
  })

  it('parses string durationMinutes to number', () => {
    expect(transformActivity(makeRaw({ durationMinutes: '90' })).duration_minutes).toBe(90)
  })

  it('returns undefined duration_minutes when NaN string', () => {
    expect(transformActivity(makeRaw({ durationMinutes: 'bad' })).duration_minutes).toBeUndefined()
  })

  it('returns undefined duration_minutes when absent', () => {
    expect(
      transformActivity(makeRaw({ durationMinutes: undefined })).duration_minutes,
    ).toBeUndefined()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields without throwing', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw({ id: 42 }))
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('gold-vision untransformActivity', () => {
  it('maps subject to summary', () => {
    expect(untransformActivity({ subject: 'Meeting' })).toMatchObject({ summary: 'Meeting' })
  })

  it('maps type to type', () => {
    expect(untransformActivity({ type: 'call' })).toMatchObject({ type: 'call' })
  })

  it('maps note to notes', () => {
    expect(untransformActivity({ note: 'Body text' })).toMatchObject({ notes: 'Body text' })
  })

  it('maps contact_id to contactId', () => {
    expect(untransformActivity({ contact_id: '7' })).toMatchObject({ contactId: '7' })
  })

  it('maps company_id to accountId', () => {
    expect(untransformActivity({ company_id: '8' })).toMatchObject({ accountId: '8' })
  })

  it('maps deal_id to opportunityId', () => {
    expect(untransformActivity({ deal_id: '9' })).toMatchObject({ opportunityId: '9' })
  })

  it('maps owner_id to ownerId', () => {
    expect(untransformActivity({ owner_id: '3' })).toMatchObject({ ownerId: '3' })
  })

  it('maps due_date to dueDate', () => {
    expect(untransformActivity({ due_date: '2024-01-15T00:00:00.000Z' })).toMatchObject({
      dueDate: '2024-01-15T00:00:00.000Z',
    })
  })

  it('maps done to completed', () => {
    expect(untransformActivity({ done: true })).toMatchObject({ completed: true })
  })

  it('maps duration_minutes to durationMinutes', () => {
    expect(untransformActivity({ duration_minutes: 45 })).toMatchObject({ durationMinutes: 45 })
  })

  it('omits undefined fields', () => {
    const result = untransformActivity({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
