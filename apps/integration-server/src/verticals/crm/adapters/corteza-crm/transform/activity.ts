/**
 * Activity (Task) transform for Corteza CRM.
 *
 * Field names are those of the `Task` module in Corteza's CRM application
 * (corteza-server provision/700_crm/1100_modules.yaml): Subject, Description,
 * OwnerId (User), ContactId, AccountId and OpportunityId (Record),
 * ActivityDate ("Due Date", DateTime) and Status (Select: Open, Completed).
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'
import type { CortezaRecord, CortezaFieldValue } from '../client'

/**
 * A record value by field name. Corteza omits `value` when it is empty
 * (record_value.go: `Value string json:"value,omitempty"`), so absent and ''
 * both read as undefined.
 */
function field(record: CortezaRecord, name: string): string | undefined {
  const found = record.values?.find((v) => v.name === name)
  return found?.value !== undefined && found.value !== '' ? found.value : undefined
}

export { CortezaRecord as RawCortezaTask }

export function transformActivity(raw: CortezaRecord): Activity {
  return {
    id: String(raw.recordID),
    type: 'task',
    subject: field(raw, 'Subject'),
    note: field(raw, 'Description'),
    owner_id: field(raw, 'OwnerId'),
    contact_id: field(raw, 'ContactId'),
    company_id: field(raw, 'AccountId'),
    deal_id: field(raw, 'OpportunityId'),
    due_date: toIsoDatetime(field(raw, 'ActivityDate')),
    done: field(raw, 'Status') === 'Completed',
    created_at: toIsoDatetime(raw.createdAt),
    updated_at: toIsoDatetime(raw.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformActivity(data: Partial<Activity>): CortezaFieldValue[] {
  const values: CortezaFieldValue[] = []
  if (data.subject !== undefined) values.push({ name: 'Subject', value: data.subject })
  if (data.note !== undefined) values.push({ name: 'Description', value: data.note })
  if (data.owner_id !== undefined) values.push({ name: 'OwnerId', value: data.owner_id })
  if (data.contact_id !== undefined) values.push({ name: 'WhoId', value: data.contact_id })
  if (data.due_date !== undefined) values.push({ name: 'ActivityDate', value: data.due_date })
  if (data.done !== undefined) {
    values.push({ name: 'Status', value: data.done ? 'Completed' : 'Not Started' })
  }
  return values
}
