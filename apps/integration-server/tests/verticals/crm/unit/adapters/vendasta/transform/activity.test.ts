import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawVendastaActivity,
} from '../../../../../../../src/verticals/crm/adapters/vendasta/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawVendastaActivity> = {}): RawVendastaActivity {
  return {
    crmObjectId: 'act_001',
    ownerId: 'usr_owner',
    created: '2026-01-15T09:30:00.000Z',
    updated: '2026-02-01T14:20:00.000Z',
    fields: [
      { fieldId: 'system__activity_activity_type', stringValue: 'task' },
      { fieldId: 'standard__activity_name', stringValue: 'Follow up call' },
      { fieldId: 'standard__activity_task_body', stringValue: 'Discuss Q1 expansion' },
      { fieldId: 'standard__activity_task_due_date', stringValue: '2026-03-01T10:00:00.000Z' },
      { fieldId: 'standard__activity_task_status', stringValue: 'pending' },
      { fieldId: 'system__activity_owner_id', stringValue: 'usr_fallback' },
    ],
    ...overrides,
  }
}

describe('vendasta transformActivity', () => {
  it('maps id from crmObjectId', () => {
    expect(transformActivity(makeRaw()).id).toBe('act_001')
  })

  it('falls back to system__activity_id field when crmObjectId absent', () => {
    const raw = makeRaw({
      crmObjectId: undefined,
      fields: [{ fieldId: 'system__activity_id', stringValue: 'act_field_id' }],
    })
    expect(transformActivity(raw).id).toBe('act_field_id')
  })

  it('maps activity type from system__activity_activity_type field', () => {
    expect(transformActivity(makeRaw()).type).toBe('task')
  })

  it('maps subject from standard__activity_name field', () => {
    expect(transformActivity(makeRaw()).subject).toBe('Follow up call')
  })

  it('maps note from standard__activity_task_body field', () => {
    expect(transformActivity(makeRaw()).note).toBe('Discuss Q1 expansion')
  })

  it('done is false when status is pending', () => {
    expect(transformActivity(makeRaw()).done).toBe(false)
  })

  it('done is true when status is completed', () => {
    const raw = makeRaw({
      fields: [{ fieldId: 'standard__activity_task_status', stringValue: 'completed' }],
    })
    expect(transformActivity(raw).done).toBe(true)
  })

  it('done is true when status is COMPLETED (uppercase)', () => {
    const raw = makeRaw({
      fields: [{ fieldId: 'standard__activity_task_status', stringValue: 'COMPLETED' }],
    })
    expect(transformActivity(raw).done).toBe(true)
  })

  it('prefers raw.ownerId over system__activity_owner_id field', () => {
    expect(transformActivity(makeRaw()).owner_id).toBe('usr_owner')
  })

  it('falls back to system__activity_owner_id field when ownerId absent', () => {
    const raw = makeRaw({
      ownerId: undefined,
      fields: [{ fieldId: 'system__activity_owner_id', stringValue: 'usr_fallback' }],
    })
    expect(transformActivity(raw).owner_id).toBe('usr_fallback')
  })

  it('maps timestamps from raw.created and raw.updated', () => {
    const result = transformActivity(makeRaw())
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('preserves raw as metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => ActivitySchema.parse(transformActivity(makeRaw()))).not.toThrow()
  })

  it('handles missing optional fields without throwing', () => {
    const minimal: RawVendastaActivity = { crmObjectId: 'act_min', fields: [] }
    expect(() => ActivitySchema.parse(transformActivity(minimal))).not.toThrow()
  })
})

describe('vendasta untransformActivity', () => {
  it('maps subject to standard__activity_name field', () => {
    const fields = untransformActivity({ subject: 'Call prep' })
    const found = fields.find((f) => f.fieldId === 'standard__activity_name')
    expect(found?.stringValue).toBe('Call prep')
  })

  it('maps done=true to status completed', () => {
    const fields = untransformActivity({ done: true })
    const found = fields.find((f) => f.fieldId === 'standard__activity_task_status')
    expect(found?.stringValue).toBe('completed')
  })

  it('maps done=false to status pending', () => {
    const fields = untransformActivity({ done: false })
    const found = fields.find((f) => f.fieldId === 'standard__activity_task_status')
    expect(found?.stringValue).toBe('pending')
  })

  it('maps type to system__activity_activity_type field', () => {
    const fields = untransformActivity({ type: 'call' })
    const found = fields.find((f) => f.fieldId === 'system__activity_activity_type')
    expect(found?.stringValue).toBe('call')
  })
})
