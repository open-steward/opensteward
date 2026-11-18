/**
 * Fixture: the documented example values of the CallLog model in the Recruit
 * CRM API reference (https://docs.recruitcrm.io/docs/rcrm-api-reference/ea4e8eee3266c-call-log).
 * `duration` is documented as "The response will be in seconds", so the
 * fixture carries the seconds form (3020 is the docs' own example of it).
 */
import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformCallLog,
  type RawRecruitCrmCallLog,
} from '../../../../../../../src/verticals/crm/adapters/recruit-crm/transform/call-log'

const DOC_CALL_LOG: RawRecruitCrmCallLog = {
  id: 2,
  call_type: 'CALL_OUTGOING',
  custom_call_type: [{ id: 2241, label: 'Follow-Up Call' }],
  call_started_on: '2020-12-01T10:30:00.000000Z',
  contact_number: '1234432112',
  call_notes: 'Will be open for offer after 2 months',
  related_to: '23123',
  related_to_type: 'candidate',
  duration: '3020',
  created_on: '2022-12-02T17:00:00.000000Z',
  updated_on: '2022-12-02T17:00:00.000000Z',
  created_by: '100023',
  updated_by: '100023',
}

describe('recruit-crm transformCallLog', () => {
  it('maps the documented example to a canonical activity', () => {
    const out = ActivitySchema.parse(transformCallLog(DOC_CALL_LOG))
    expect(out).toEqual({
      id: 'call-log_2',
      type: 'call',
      note: 'Will be open for offer after 2 months',
      due_date: '2020-12-01T10:30:00.000Z',
      duration_minutes: 50,
      created_at: '2022-12-02T17:00:00.000Z',
      updated_at: '2022-12-02T17:00:00.000Z',
      metadata: DOC_CALL_LOG,
    })
  })

  it('leaves duration unset when it is not a whole number of seconds', () => {
    expect(
      transformCallLog({ ...DOC_CALL_LOG, duration: '1h 2m 10s' }).duration_minutes,
    ).toBeUndefined()
  })

  it('reads created_at from created_on and updated_at from updated_on', () => {
    // The documented example gives both fields one value, so pin them apart.
    const out = transformCallLog({
      ...DOC_CALL_LOG,
      created_on: '2022-01-01T00:00:00.000000Z',
      updated_on: '2023-06-15T12:30:00.000000Z',
    })
    expect(out.created_at).toBe('2022-01-01T00:00:00.000Z')
    expect(out.updated_at).toBe('2023-06-15T12:30:00.000Z')
  })

  it('parses with only the id present', () => {
    expect(ActivitySchema.parse(transformCallLog({ id: 4 })).id).toBe('call-log_4')
  })

  it('throws on a call log with no id', () => {
    expect(() => transformCallLog({} as RawRecruitCrmCallLog)).toThrow(/no id/)
  })
})
