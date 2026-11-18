import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
  type RawVtigerActivity,
} from '../../../../../../../src/verticals/crm/adapters/vtiger/transform/activity'

/**
 * Field names are the webservice names vtiger's own installer gives the
 * Calendar (tabid 9) and Events (tabid 16) modules
 * (code.vtiger.com, modules/Users/DefaultDataPopulator.php), for example:
 *   insert into vtiger_field values (9,…,'contactid','vtiger_cntactivityrel',1,'57','contact_id','Contact Name',…)
 *   insert into vtiger_field values (16,…,'date_start','vtiger_activity',1,'6','date_start','Start Date & Time',…)
 * Value formats follow the documented record examples on
 * https://vtap.vtiger.com/platform/rest-apis.html
 * ("createdtime": "2023-06-13 05:46:59", ids of the form "4x506").
 */
function documentedEvent(overrides: Partial<RawVtigerActivity> = {}): RawVtigerActivity {
  return {
    subject: 'Discovery call',
    assigned_user_id: '19x1',
    date_start: '2023-06-14',
    time_start: '09:30:00',
    due_date: '2023-06-14',
    time_end: '10:00:00',
    recurringtype: '',
    duration_hours: '0',
    duration_minutes: '30',
    parent_id: '11x40',
    eventstatus: 'Planned',
    sendnotification: '0',
    activitytype: 'Call',
    location: '',
    createdtime: '2023-06-13 05:46:59',
    modifiedtime: '2023-06-13 05:47:40',
    modifiedby: '19x1',
    description: 'Talk about Q3',
    reminder_time: '',
    contact_id: '4x506',
    id: '18x520',
    ...overrides,
  }
}

describe('vtiger transformActivity', () => {
  it('maps the documented Events record and satisfies the canonical schema', () => {
    const raw = documentedEvent()
    const out = ActivitySchema.parse(transformActivity(raw))
    expect(out).toEqual({
      id: '18x520',
      type: 'Call',
      subject: 'Discovery call',
      note: 'Talk about Q3',
      due_date: '2023-06-14T09:30:00.000Z',
      owner_id: '19x1',
      contact_id: '4x506',
      created_at: '2023-06-13T05:46:59.000Z',
      updated_at: '2023-06-13T05:47:40.000Z',
      metadata: raw,
    })
  })

  it('reads contact_id, the documented field name, not contactid', () => {
    expect(transformActivity(documentedEvent({ contact_id: '4x9' })).contact_id).toBe('4x9')
    const legacy = documentedEvent({ contact_id: '' })
    ;(legacy as Record<string, unknown>)['contactid'] = '4x9'
    expect(transformActivity(legacy).contact_id).toBeUndefined()
  })

  it('omits due_date when time_start is empty rather than inventing a time of day', () => {
    const out = ActivitySchema.parse(transformActivity(documentedEvent({ time_start: '' })))
    expect(out.due_date).toBeUndefined()
  })

  it('omits empty reference fields', () => {
    const out = ActivitySchema.parse(
      transformActivity(documentedEvent({ contact_id: '', assigned_user_id: '' })),
    )
    expect(out.contact_id).toBeUndefined()
    expect(out.owner_id).toBeUndefined()
  })

  it('omits empty activitytype, subject and description rather than passing ""', () => {
    const out = ActivitySchema.parse(
      transformActivity(documentedEvent({ activitytype: '', subject: '', description: '' })),
    )
    expect(out.type).toBeUndefined()
    expect(out.subject).toBeUndefined()
    expect(out.note).toBeUndefined()
  })

  it('parses a bare record with only an id', () => {
    const raw: RawVtigerActivity = { id: '9x1' }
    expect(ActivitySchema.parse(transformActivity(raw))).toEqual({ id: '9x1', metadata: raw })
  })

  it('preserves raw metadata by reference', () => {
    const raw = documentedEvent()
    expect(transformActivity(raw).metadata).toBe(raw)
  })
})

describe('vtiger untransformActivity', () => {
  it('splits due_date into date_start and time_start', () => {
    const result = untransformActivity({ due_date: '2024-06-01T10:00:00' })
    expect(result.date_start).toBe('2024-06-01')
    expect(result.time_start).toBe('10:00:00')
  })
})
