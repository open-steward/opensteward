import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  NOTE_ACTIVITY_TYPE,
  isNoteActivity,
  transformNoteActivity,
  untransformNoteActivity,
} from '../../../../../../../src/verticals/crm/adapters/copper/transform/note'
import type { RawCopperActivity } from '../../../../../../../src/verticals/crm/adapters/copper/transform/activity'

/**
 * Copper lists notes as activities: "By default, Copper has three user-entered
 * activity types: Notes, Phone Calls, and Meetings. Notes have a hard-coded ID
 * of 0." (https://developer.copper.com/activities/list-activity-types.html)
 */
describe('copper transformNoteActivity', () => {
  const activity = (overrides: Partial<RawCopperActivity> = {}): RawCopperActivity => ({
    id: 3064242278,
    parent: { id: 27140359, type: 'person' },
    type: { id: 0, category: 'user' },
    user_id: 137658,
    details: 'This is the description of this note',
    activity_date: 1496772355,
    date_created: 1496772355,
    date_modified: 1496772355,
    ...overrides,
  })

  it('maps the documented note activity example onto a Note', () => {
    const note = transformNoteActivity(activity())
    expect(note).toMatchObject({
      id: '3064242278',
      content: 'This is the description of this note',
      contact_id: '27140359',
      owner_id: '137658',
      created_at: '2017-06-06T18:05:55.000Z',
      updated_at: '2017-06-06T18:05:55.000Z',
    })
    expect(note.company_id).toBeUndefined()
    expect(note.deal_id).toBeUndefined()
    expect(() => NoteSchema.parse(note)).not.toThrow()
  })

  it.each([
    ['company', 'company_id'],
    ['opportunity', 'deal_id'],
    ['person', 'contact_id'],
  ] as const)('maps a %s parent to %s', (type, field) => {
    const note = transformNoteActivity(activity({ parent: { id: 42, type } }))
    expect(note[field]).toBe('42')
  })

  it('an activity with no details or parent is still a valid Note', () => {
    const note = transformNoteActivity({ id: 7 })
    expect(note.content).toBe('')
    expect(() => NoteSchema.parse(note)).not.toThrow()
  })

  it('preserves the raw activity as metadata', () => {
    const raw = activity()
    expect(transformNoteActivity(raw).metadata).toBe(raw)
  })

  it('names the documented note activity type', () => {
    expect(NOTE_ACTIVITY_TYPE).toEqual({ category: 'user', id: 0 })
  })
})

describe('copper isNoteActivity', () => {
  it('is a user-entered activity of type id 0, and nothing else', () => {
    expect(isNoteActivity({ id: 1, type: { category: 'user', id: 0 } })).toBe(true)
    expect(isNoteActivity({ id: 1, type: { category: 'user', id: 190711 } })).toBe(false)
    expect(isNoteActivity({ id: 1, type: { category: 'system', id: 0 } })).toBe(false)
    expect(isNoteActivity({ id: 1 })).toBe(false)
  })
})

describe('copper untransformNoteActivity', () => {
  it('builds the documented "Create New Note" body', () => {
    expect(
      untransformNoteActivity({
        content: 'This is the description of this note',
        contact_id: '27140359',
      }),
    ).toEqual({
      parent: { type: 'person', id: 27140359 },
      type: { category: 'user', id: 0 },
      details: 'This is the description of this note',
    })
  })

  it.each([
    ['company_id', 'company'],
    ['deal_id', 'opportunity'],
  ] as const)('maps %s to a %s parent', (field, type) => {
    expect(untransformNoteActivity({ content: 'x', [field]: '42' }).parent).toEqual({ type, id: 42 })
  })

  it('always carries the note type, even with nothing else to send', () => {
    expect(untransformNoteActivity({})).toEqual({ type: { category: 'user', id: 0 } })
  })

  it('round-trips through transformNoteActivity', () => {
    const body = untransformNoteActivity({ content: 'Hello', deal_id: '8' })
    const note = transformNoteActivity({ id: 5, ...body } as RawCopperActivity)
    expect(note).toMatchObject({ id: '5', content: 'Hello', deal_id: '8' })
    expect(() => NoteSchema.parse(note)).not.toThrow()
  })
})
