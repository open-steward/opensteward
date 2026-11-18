import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawMethodActivity,
} from '../../../../../../../src/verticals/crm/adapters/method-crm/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawMethodActivity> = {}): RawMethodActivity {
  return {
    RecordId: '42',
    Type: 'call',
    Comments: 'Follow up with client',
    Status: 'Completed',
    DueDate: '2026-03-01T09:00:00.000Z',
    StartDate: '2026-03-01T08:00:00.000Z',
    ContactRecordID: '7',
    OpportunityRecordID: '99',
    AssignedTo: 'usr_alice',
    CreatedDate: '2026-01-15T09:30:00.000Z',
    ModifiedDate: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('method-crm transformActivity', () => {
  it('maps RecordId to string id', () => {
    expect(transformActivity(makeRaw({ RecordId: 100 })).id).toBe('100')
  })

  it('maps Type to type', () => {
    expect(transformActivity(makeRaw()).type).toBe('call')
  })

  it('maps Comments to note', () => {
    expect(transformActivity(makeRaw()).note).toBe('Follow up with client')
  })

  it('maps Status "Completed" to done=true', () => {
    expect(transformActivity(makeRaw({ Status: 'Completed' })).done).toBe(true)
  })

  it('maps Status "Open" to done=false', () => {
    expect(transformActivity(makeRaw({ Status: 'Open' })).done).toBe(false)
  })

  it('maps ContactRecordID to contact_id string', () => {
    expect(transformActivity(makeRaw({ ContactRecordID: 7 })).contact_id).toBe('7')
  })

  it('maps OpportunityRecordID to deal_id string', () => {
    expect(transformActivity(makeRaw()).deal_id).toBe('99')
  })

  it('maps AssignedTo to owner_id', () => {
    expect(transformActivity(makeRaw()).owner_id).toBe('usr_alice')
  })

  it('maps DueDate to due_date', () => {
    expect(transformActivity(makeRaw()).due_date).toBe('2026-03-01T09:00:00.000Z')
  })

  it('maps CreatedDate / ModifiedDate', () => {
    const result = transformActivity(makeRaw())
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('passes ActivitySchema validation', () => {
    expect(() => ActivitySchema.parse(transformActivity(makeRaw()))).not.toThrow()
  })

  it('returns undefined contact_id when ContactRecordID is absent', () => {
    expect(transformActivity(makeRaw({ ContactRecordID: undefined })).contact_id).toBeUndefined()
  })

  it('untransformActivity maps done=true to Status="Completed"', () => {
    expect(untransformActivity({ done: true }).Status).toBe('Completed')
  })

  it('untransformActivity maps done=false to Status="Open"', () => {
    expect(untransformActivity({ done: false }).Status).toBe('Open')
  })

  it('untransformActivity maps type and note', () => {
    const out = untransformActivity({ type: 'email', note: 'Hi there' })
    expect(out.Type).toBe('email')
    expect(out.Comments).toBe('Hi there')
  })
})
