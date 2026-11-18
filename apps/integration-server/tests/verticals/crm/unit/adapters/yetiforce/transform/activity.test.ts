/**
 * Calendar raw data (`x-raw-data: 1`, Record_Raw_Details in
 * WebservicePremium.json) with the Calendar field names and activitystatus
 * values of YetiForce's install schema.
 */
import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
  type RawYetiForceActivity,
} from '../../../../../../../src/verticals/crm/adapters/yetiforce/transform/activity'

function makeRaw(overrides: RawYetiForceActivity = {}): RawYetiForceActivity {
  return {
    id: 201,
    subject: 'Discovery call',
    activitytype: 'Call',
    description: 'Follow up on Q1 expansion',
    activitystatus: 'PLL_PLANNED',
    assigned_user_id: 1,
    date_start: '2026-02-01',
    time_start: '14:00:00',
    due_date: '2026-02-01',
    time_end: '14:20:00',
    createdtime: '2026-01-15 09:30:00',
    modifiedtime: '2026-01-16 10:00:00',
    ...overrides,
  }
}

describe('yetiforce transformActivity', () => {
  it('maps the documented fields and parses as a canonical Activity', () => {
    const a = ActivitySchema.parse(transformActivity('201', makeRaw(), 'UTC'))
    expect(a).toMatchObject({
      id: '201',
      type: 'Call',
      subject: 'Discovery call',
      note: 'Follow up on Q1 expansion',
      owner_id: '1',
      due_date: '2026-02-01T14:20:00.000Z',
      done: false,
      created_at: '2026-01-15T09:30:00.000Z',
      updated_at: '2026-01-16T10:00:00.000Z',
    })
  })

  it('is done only when activitystatus is PLL_COMPLETED', () => {
    expect(transformActivity('201', makeRaw({ activitystatus: 'PLL_COMPLETED' }), 'UTC').done).toBe(
      true,
    )
    expect(transformActivity('201', makeRaw({ activitystatus: 'PLL_CANCELLED' }), 'UTC').done).toBe(
      false,
    )
    expect(
      transformActivity('201', makeRaw({ activitystatus: undefined }), 'UTC').done,
    ).toBeUndefined()
  })

  it('reads due_date and time_end in the raw time zone', () => {
    expect(transformActivity('201', makeRaw(), 'Europe/Warsaw').due_date).toBe(
      '2026-02-01T13:20:00.000Z',
    )
  })

  it('leaves due_date out without a time_end rather than inventing a time', () => {
    expect(transformActivity('201', makeRaw({ time_end: '' }), 'UTC').due_date).toBeUndefined()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity('201', raw, 'UTC').metadata).toBe(raw)
  })
})

describe('yetiforce untransformActivity', () => {
  it('maps type to activitytype', () => {
    expect(untransformActivity({ type: 'Meeting' }).activitytype).toBe('Meeting')
  })
})
