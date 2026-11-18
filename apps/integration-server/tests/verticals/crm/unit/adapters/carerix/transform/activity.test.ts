/**
 * Carerix CRToDo → canonical Activity.
 *
 * Field names are the CRToDo attributes that Carerix's own REST client
 * generates from the API's describe service
 * (github.com/carerix/cxrest-client, src/Carerix/Api/Rest/Entity/
 * AbstractEntity/AbstractCRToDo.php, "THIS FILE WAS GENERATED AUTOMATICALLY
 * USING REST API ENTITY DESCRIBE SERVICE"): todoID, subject, deadline,
 * todoTypeKey, creationDate, modificationDate, plus `notes` from CRToDo.php.
 *
 * Dates follow https://help.carerix.com/en/articles/9464648-carerix-rest-api:
 * "All dates and timestamps are in “Europe/Amsterdam” timezone (+0200) unless
 * noted otherwise." and "YYYY-MM-DD HH:MM:SS +0200"; the same article's
 * example responses carry offset-less values such as
 * `<creationDate>2014-02-20 09:22:47</creationDate>`.
 */
import { describe, it, expect } from 'vitest'
import {
  carerixDateToIso,
  transformActivity,
  untransformActivity,
  type RawCarerixTodo,
} from '../../../../../../../src/verticals/crm/adapters/carerix/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

/** A CRToDo built from the documented attribute names and date format. */
function documentedTodo(overrides: Partial<RawCarerixTodo> = {}): RawCarerixTodo {
  return {
    todoID: 489457,
    subject: 'Intake call with candidate',
    notes: 'Discuss availability',
    todoTypeKey: 1,
    deadline: '2014-02-20 09:22:47',
    creationDate: '2014-01-15 12:00:00',
    modificationDate: '2014-07-01 08:30:00 +0200',
    ...overrides,
  }
}

describe('carerix transformActivity', () => {
  it('parses the documented CRToDo shape with ActivitySchema', () => {
    const out = ActivitySchema.parse(transformActivity(documentedTodo()))
    expect(out).toMatchObject({
      id: '489457',
      subject: 'Intake call with candidate',
      note: 'Discuss availability',
      type: 'meeting',
      due_date: '2014-02-20T08:22:47.000Z',
      created_at: '2014-01-15T11:00:00.000Z',
      updated_at: '2014-07-01T06:30:00.000Z',
    })
  })

  it('reads the id from todoID only (the documented identifier key)', () => {
    expect(transformActivity(documentedTodo({ todoID: 42 })).id).toBe('42')
    expect(() => transformActivity({ id: 99 } as RawCarerixTodo)).toThrow(/todoID/)
  })

  it.each([
    [0, 'task'],
    [1, 'meeting'],
    [3, 'email'],
    [4, 'note'],
    [5, 'draft'],
    [22, 'campaign'],
    [25, 'system_activity'],
    [33, 'newsletter'],
    [34, 'edition'],
    ['0', 'task'],
  ])('maps todoTypeKey %s to %s', (key, want) => {
    expect(transformActivity(documentedTodo({ todoTypeKey: key })).type).toBe(want)
  })

  it('leaves type unset for an undocumented todoTypeKey', () => {
    expect(transformActivity(documentedTodo({ todoTypeKey: 99 })).type).toBeUndefined()
    expect(transformActivity(documentedTodo({ todoTypeKey: undefined })).type).toBeUndefined()
  })

  it('does not invent done or linked ids that CRToDo does not document as scalars', () => {
    const out = transformActivity(documentedTodo())
    expect(out.done).toBeUndefined()
    expect(out.contact_id).toBeUndefined()
    expect(out.company_id).toBeUndefined()
    expect(out.owner_id).toBeUndefined()
  })

  it('preserves the raw record as metadata', () => {
    const raw = documentedTodo()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('omits empty optional fields and still parses', () => {
    const out = transformActivity({ todoID: 7 })
    expect(ActivitySchema.parse(out)).toEqual({ id: '7', metadata: { todoID: 7 } })
  })

  it('refuses an empty todoID rather than emitting an empty id', () => {
    expect(() => transformActivity(documentedTodo({ todoID: '' }))).toThrow(/todoID/)
  })

  it('omits empty-string subject and notes instead of emitting them', () => {
    const out = transformActivity(documentedTodo({ subject: '', notes: '' }))
    expect('subject' in out).toBe(false)
    expect('note' in out).toBe(false)
  })
})

describe('carerixDateToIso', () => {
  it('reads an offset-less value as Europe/Amsterdam wall-clock time (winter, +01:00)', () => {
    expect(carerixDateToIso('2014-02-20 09:22:47')).toBe('2014-02-20T08:22:47.000Z')
  })

  it('reads an offset-less value as Europe/Amsterdam wall-clock time (summer, +02:00)', () => {
    expect(carerixDateToIso('2012-06-21 08:54:43')).toBe('2012-06-21T06:54:43.000Z')
  })

  it('uses the offset in force at the wall-clock time, not at the same digits read as UTC, around DST changes', () => {
    // 2014-03-30: CET → CEST at 01:00Z. 01:30 local is still CET (+01:00).
    expect(carerixDateToIso('2014-03-30 01:30:00')).toBe('2014-03-30T00:30:00.000Z')
    // 2014-10-26: CEST → CET at 01:00Z. 01:30 local is still CEST (+02:00).
    expect(carerixDateToIso('2014-10-26 01:30:00')).toBe('2014-10-25T23:30:00.000Z')
  })

  it('honours the documented explicit offset form "YYYY-MM-DD HH:MM:SS +0200"', () => {
    expect(carerixDateToIso('2013-04-28 12:00:00 +0200')).toBe('2013-04-28T10:00:00.000Z')
    expect(carerixDateToIso('2013-04-28 12:00:00 -0130')).toBe('2013-04-28T13:30:00.000Z')
  })

  it('parses the documented example "2013-04-28 12:00 +02:00" (no seconds, colon offset)', () => {
    expect(carerixDateToIso('2013-04-28 12:00 +02:00')).toBe('2013-04-28T10:00:00.000Z')
  })

  it('ignores surrounding whitespace', () => {
    expect(carerixDateToIso('  2013-04-28 12:00 +02:00 ')).toBe('2013-04-28T10:00:00.000Z')
  })

  it('returns undefined for missing or unparseable values', () => {
    expect(carerixDateToIso(undefined)).toBeUndefined()
    expect(carerixDateToIso('')).toBeUndefined()
    expect(carerixDateToIso('next tuesday')).toBeUndefined()
  })
})

describe('carerix untransformActivity', () => {
  it('maps subject to todoText', () => {
    const result = untransformActivity({ subject: 'Call Acme' })
    expect(result.todoText).toBe('Call Acme')
  })

  it('maps note to description', () => {
    const result = untransformActivity({ note: 'Follow up' })
    expect(result.description).toBe('Follow up')
  })

  it('maps due_date to todoDate', () => {
    const result = untransformActivity({ due_date: '2026-06-01T09:00:00.000Z' })
    expect(result.todoDate).toBe('2026-06-01T09:00:00.000Z')
  })

  it('maps owner_id to toUser', () => {
    const result = untransformActivity({ owner_id: 'usr_1' })
    expect(result.toUser).toBe('usr_1')
  })

  it('maps contact_id to toEmployee', () => {
    const result = untransformActivity({ contact_id: 'emp_5' })
    expect(result.toEmployee).toBe('emp_5')
  })

  it('maps done to isDone', () => {
    const result = untransformActivity({ done: true })
    expect(result.isDone).toBe(true)
  })

  it('omits undefined fields', () => {
    const result = untransformActivity({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
