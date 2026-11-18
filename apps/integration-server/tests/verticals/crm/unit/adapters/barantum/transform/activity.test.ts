import { describe, it, expect } from 'vitest'
import {
  parseActivityId,
  transformActivityRow,
  transformCall,
  transformLegacyActivity,
  transformMeeting,
  transformTask,
  untransformActivity,
  type RawBarantumLegacyActivity,
} from '../../../../../../../src/verticals/crm/adapters/barantum/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { DOC_CALL, DOC_MEETING, DOC_TASK } from '../fixtures/documented'

describe('barantum transformCall (documented Calls row)', () => {
  it('parses against ActivitySchema', () => {
    const a = ActivitySchema.parse(transformCall(DOC_CALL))
    expect(a.id).toBe('calls:6487def6-2dea-4cce-9136-57f63832d46d')
    expect(a.type).toBe('call')
    expect(a.subject).toBe('UPDATE API 1')
    expect(a.note).toBeUndefined()
    expect(a.contact_id).toBe('1a2ca6c6-3d4c-4285-885c-e83cc02a4810')
    expect(a.company_id).toBe('d4e2a745-82fa-4b58-8490-f682bff30959')
    expect(a.deal_id).toBeUndefined()
    expect(a.duration_minutes).toBeUndefined()
    expect(a.due_date).toBeUndefined()
    expect(a.done).toBeUndefined()
    expect(a.created_at).toBeUndefined()
    expect(a.metadata).toEqual(DOC_CALL)
  })

  it('maps a set related_deals_uuid to deal_id, for every activity module', () => {
    const deal = '0f1a6b95-80d5-48a2-905e-3f6bc70625e5'
    expect(transformCall({ ...DOC_CALL, related_deals_uuid: deal }).deal_id).toBe(deal)
    expect(transformMeeting({ ...DOC_MEETING, related_deals_uuid: deal }).deal_id).toBe(deal)
    expect(transformTask({ ...DOC_TASK, related_deals_uuid: deal }).deal_id).toBe(deal)
  })

  it('adds hours and minutes into duration_minutes when both are set', () => {
    const a = transformCall({
      ...DOC_CALL,
      calls_duration_hours: '1',
      calls_duration_minutes: '15',
    })
    expect(a.duration_minutes).toBe(75)
  })

  it('throws on a row with no calls_uuid', () => {
    expect(() => transformCall({ ...DOC_CALL, calls_uuid: '' })).toThrow(/calls_uuid/)
  })
})

describe('barantum transformMeeting (documented Meetings row)', () => {
  it('parses against ActivitySchema', () => {
    const a = ActivitySchema.parse(transformMeeting(DOC_MEETING))
    expect(a.id).toBe('meetings:c5e29ae7-443d-4356-bce8-b770284f773e')
    expect(a.type).toBe('meeting')
    expect(a.subject).toBe('Test API')
    expect(a.note).toBeUndefined()
    expect(a.duration_minutes).toBe(0)
    expect(a.company_id).toBe('d4e2a745-82fa-4b58-8490-f682bff30959')
    expect(a.contact_id).toBeUndefined()
  })
})

describe('barantum transformTask (documented Tasks row)', () => {
  it('parses against ActivitySchema', () => {
    const a = ActivitySchema.parse(transformTask(DOC_TASK))
    expect(a.id).toBe('tasks:d05a64b0-3e76-4f59-9343-9b2c74bf3e8e')
    expect(a.type).toBe('task')
    expect(a.subject).toBe('UPDATE API 1 Update Tasks2')
    expect(a.note).toBe('Ini dari hit API')
    expect(a.due_date).toBeUndefined()
  })
})

describe('barantum transformActivityRow / parseActivityId', () => {
  it('dispatches each module to its transform', () => {
    expect(transformActivityRow('Calls', DOC_CALL).id).toBe(transformCall(DOC_CALL).id)
    expect(transformActivityRow('Meetings', DOC_MEETING).id).toBe(transformMeeting(DOC_MEETING).id)
    expect(transformActivityRow('Tasks', DOC_TASK).id).toBe(transformTask(DOC_TASK).id)
  })

  it('round-trips the module and uuid of every activity id', () => {
    for (const [a, module, uuid] of [
      [transformCall(DOC_CALL), 'Calls', DOC_CALL.calls_uuid],
      [transformMeeting(DOC_MEETING), 'Meetings', DOC_MEETING.meetings_uuid],
      [transformTask(DOC_TASK), 'Tasks', DOC_TASK.tasks_uuid],
    ] as const) {
      const parsed = parseActivityId(a.id)
      expect(parsed?.spec.module).toBe(module)
      expect(parsed?.uuid).toBe(uuid)
    }
  })

  it('rejects ids that name no module', () => {
    expect(parseActivityId('6487def6-2dea-4cce-9136-57f63832d46d')).toBeUndefined()
    expect(parseActivityId('emails:abc')).toBeUndefined()
    expect(parseActivityId('calls:')).toBeUndefined()
  })
})

// ── Legacy: the response parser createActivity (a write method) still uses ──

function makeRaw(overrides: Partial<RawBarantumLegacyActivity> = {}): RawBarantumLegacyActivity {
  return { id: 'act-1', ...overrides }
}

describe('barantum transformLegacyActivity', () => {
  it('maps id to string', () => {
    expect(transformLegacyActivity(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps type from known types', () => {
    expect(transformLegacyActivity(makeRaw({ type: 'call' })).type).toBe('call')
    expect(transformLegacyActivity(makeRaw({ type: 'email' })).type).toBe('email')
    expect(transformLegacyActivity(makeRaw({ type: 'meeting' })).type).toBe('meeting')
    expect(transformLegacyActivity(makeRaw({ type: 'task' })).type).toBe('task')
  })

  it('lowercases type before mapping', () => {
    expect(transformLegacyActivity(makeRaw({ type: 'CALL' })).type).toBe('call')
    expect(transformLegacyActivity(makeRaw({ type: 'Email' })).type).toBe('email')
  })

  it('passes through unknown type values lowercased', () => {
    expect(transformLegacyActivity(makeRaw({ type: 'CustomType' })).type).toBe('customtype')
  })

  it('maps subject', () => {
    expect(transformLegacyActivity(makeRaw({ subject: 'Follow-up call' })).subject).toBe(
      'Follow-up call',
    )
  })

  it('maps description to note', () => {
    expect(transformLegacyActivity(makeRaw({ description: 'Some notes' })).note).toBe('Some notes')
  })

  it('maps contact_id to string', () => {
    expect(transformLegacyActivity(makeRaw({ contact_id: 99 })).contact_id).toBe('99')
  })

  it('maps company_id to string', () => {
    expect(transformLegacyActivity(makeRaw({ company_id: 55 })).company_id).toBe('55')
  })

  it('maps deal_id to string', () => {
    expect(transformLegacyActivity(makeRaw({ deal_id: 33 })).deal_id).toBe('33')
  })

  it('maps owner_id to string', () => {
    expect(transformLegacyActivity(makeRaw({ owner_id: 7 })).owner_id).toBe('7')
  })

  it('maps is_done boolean true to done=true', () => {
    expect(transformLegacyActivity(makeRaw({ is_done: true })).done).toBe(true)
  })

  it('maps is_done=1 to done=true', () => {
    expect(transformLegacyActivity(makeRaw({ is_done: 1 })).done).toBe(true)
  })

  it('maps is_done="true" to done=true', () => {
    expect(transformLegacyActivity(makeRaw({ is_done: 'true' })).done).toBe(true)
  })

  it('maps is_done=false to done=false', () => {
    expect(transformLegacyActivity(makeRaw({ is_done: false })).done).toBe(false)
  })

  it('maps duration in minutes', () => {
    expect(transformLegacyActivity(makeRaw({ duration: 30 })).duration_minutes).toBe(30)
    expect(transformLegacyActivity(makeRaw({ duration: '45' })).duration_minutes).toBe(45)
  })

  it('converts ISO due_date', () => {
    const result = transformLegacyActivity(makeRaw({ due_date: '2026-03-01T10:00:00.000Z' }))
    expect(result.due_date).toMatch(/2026-03-01/)
  })

  it('converts ISO created_at/updated_at', () => {
    const result = transformLegacyActivity(
      makeRaw({
        created_at: '2026-01-15T09:30:00.000Z',
        updated_at: '2026-02-01T14:20:00.000Z',
      }),
    )
    expect(result.created_at).toMatch(/2026-01-15/)
    expect(result.updated_at).toMatch(/2026-02-01/)
  })

  it('passes ActivitySchema.parse without throwing', () => {
    const raw = makeRaw({
      id: '10',
      type: 'call',
      subject: 'Discovery call',
      description: 'Discussed Q1',
      contact_id: '99',
      company_id: '55',
      owner_id: '7',
      due_date: '2026-03-01T10:00:00.000Z',
      is_done: false,
      duration: 30,
      created_at: '2026-01-15T09:30:00.000Z',
      updated_at: '2026-02-01T14:20:00.000Z',
    })
    expect(() => ActivitySchema.parse(transformLegacyActivity(raw))).not.toThrow()
  })
})

describe('barantum untransformActivity', () => {
  it('maps type back', () => {
    expect(untransformActivity({ type: 'call' }).type).toBe('call')
  })

  it('maps subject back', () => {
    expect(untransformActivity({ subject: 'My Subject' }).subject).toBe('My Subject')
  })

  it('maps note back to description', () => {
    expect(untransformActivity({ note: 'Body text' }).description).toBe('Body text')
  })

  it('maps done back to is_done', () => {
    expect(untransformActivity({ done: true }).is_done).toBe(true)
    expect(untransformActivity({ done: false }).is_done).toBe(false)
  })

  it('round-trips type, subject, done', () => {
    const raw = makeRaw({ type: 'meeting', subject: 'Kickoff', is_done: false })
    const canonical = transformLegacyActivity(raw)
    const back = untransformActivity(canonical)
    expect(back.type).toBe('meeting')
    expect(back.subject).toBe('Kickoff')
    expect(back.is_done).toBe(false)
  })
})
