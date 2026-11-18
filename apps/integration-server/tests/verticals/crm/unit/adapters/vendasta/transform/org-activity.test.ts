import { describe, expect, it } from 'vitest'
import {
  transformOrgActivity,
  type RawVendastaOrgActivity,
} from '../../../../../../../src/verticals/crm/adapters/vendasta/transform/org-activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

/**
 * Fixture built from the documented ListCrmRecords response (objects[].id,
 * objects[].fields[].{id, value}) and the documented CRM Activity field
 * schema (components.schemas.CRMActivity) in
 * https://raw.githubusercontent.com/vendasta/api-gateway-docs/master/openapi/crm/crm.json
 */
function makeRaw(overrides: Partial<RawVendastaOrgActivity> = {}): RawVendastaOrgActivity {
  return {
    id: 'Activity001',
    fields: [
      // crm.json documents this field only as 'Type of activity' with no enum,
      // so the fixture uses an opaque value the transform must pass through verbatim.
      { id: 'system__activity_activity_type', value: 'opaque-activity-type' },
      { id: 'standard__activity_name', value: 'Follow up call' },
      { id: 'standard__activity_task_due_date', value: '2026-12-31T17:00:00Z' },
      { id: 'standard__activity_task_status', value: 'NOT_STARTED' },
      { id: 'system__activity_owner_id', value: 'U-123' },
      { id: 'system__activity_created', value: '2026-01-15' },
      { id: 'system__activity_updated', value: { seconds: 1769940000, nanos: 500000000 } },
    ],
    ...overrides,
  }
}

describe('vendasta transformOrgActivity', () => {
  it('parses against ActivitySchema', () => {
    const out = ActivitySchema.parse(transformOrgActivity(makeRaw()))
    expect(out).toEqual({
      id: 'Activity001',
      type: 'opaque-activity-type',
      subject: 'Follow up call',
      owner_id: 'U-123',
      due_date: '2026-12-31T17:00:00.000Z',
      done: false,
      created_at: '2026-01-15T00:00:00.000Z',
      updated_at: '2026-02-01T10:00:00.500Z',
      metadata: makeRaw(),
    })
  })

  it('reads id from objects[].id only', () => {
    expect(transformOrgActivity(makeRaw({ id: 'A-9' })).id).toBe('A-9')
  })

  it('throws rather than inventing an id when objects[].id is missing', () => {
    expect(() => transformOrgActivity(makeRaw({ id: undefined }))).toThrow(/no id/)
  })

  it('done is true only for the documented COMPLETED task status', () => {
    const raw = makeRaw({ fields: [{ id: 'standard__activity_task_status', value: 'COMPLETED' }] })
    expect(ActivitySchema.parse(transformOrgActivity(raw)).done).toBe(true)
  })

  it('leaves done undefined when the record carries no task status', () => {
    const raw = makeRaw({ fields: [{ id: 'standard__activity_name', value: 'Meeting' }] })
    const out = ActivitySchema.parse(transformOrgActivity(raw))
    expect(out.done).toBeUndefined()
    expect(out.type).toBeUndefined()
    expect(out.created_at).toBeUndefined()
  })

  it('converts a Timestamp {seconds, nanos} value to ISO', () => {
    const raw = makeRaw({
      fields: [{ id: 'system__activity_created', value: { seconds: 1768469400, nanos: 0 } }],
    })
    expect(ActivitySchema.parse(transformOrgActivity(raw)).created_at).toBe(
      '2026-01-15T09:30:00.000Z',
    )
  })

  it('ignores non-string values for string fields', () => {
    const raw = makeRaw({ fields: [{ id: 'standard__activity_name', value: 42 }] })
    expect(ActivitySchema.parse(transformOrgActivity(raw)).subject).toBeUndefined()
  })
})
