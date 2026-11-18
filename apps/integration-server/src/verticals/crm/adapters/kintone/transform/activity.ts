import type { Activity } from '../../../schema/activity'
import type { KintoneRecord } from '../client'

// NOTE: Kintone field codes are user-configured per app.
// These defaults must match the user's Kintone activities app configuration.
const FIELD_CODES = {
  type: 'activity_type',     // Dropdown/Text field for activity type
  subject: 'subject',        // Text field for subject/title
  companyId: 'company_id',   // Text/Number field for company
  contactId: 'contact_id',   // Text/Number field for contact
  dealId: 'deal_id',         // Text/Number field for deal
  ownerId: 'owner_id',       // Text/Number field for owner
  dueDate: 'due_date',       // Date/DateTime field for due date
  done: 'done',              // Checkbox/Text field for completion status
  createdAt: '作成日時',      // Kintone built-in creation datetime
  updatedAt: '更新日時',      // Kintone built-in update datetime
} as const

function fieldValue(raw: KintoneRecord, code: string): string | undefined {
  const v = raw[code]?.value
  if (v == null || v === '') return undefined
  return String(v)
}

export function transformActivity(raw: KintoneRecord): Activity {
  const doneRaw = fieldValue(raw, FIELD_CODES.done)
  return {
    id: raw.$id?.value,
    type: fieldValue(raw, FIELD_CODES.type),
    subject: fieldValue(raw, FIELD_CODES.subject),
    company_id: fieldValue(raw, FIELD_CODES.companyId),
    contact_id: fieldValue(raw, FIELD_CODES.contactId),
    deal_id: fieldValue(raw, FIELD_CODES.dealId),
    owner_id: fieldValue(raw, FIELD_CODES.ownerId),
    due_date: fieldValue(raw, FIELD_CODES.dueDate),
    done: doneRaw === 'true' || doneRaw === '1' || doneRaw === 'on',
    created_at: fieldValue(raw, FIELD_CODES.createdAt),
    updated_at: fieldValue(raw, FIELD_CODES.updatedAt),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, { value: unknown }> {
  const out: Record<string, { value: unknown }> = {}
  // TODO: field codes must match the user's Kintone activities app configuration
  if (data.type !== undefined) out[FIELD_CODES.type] = { value: data.type }
  if (data.subject !== undefined) out[FIELD_CODES.subject] = { value: data.subject }
  if (data.company_id !== undefined) out[FIELD_CODES.companyId] = { value: data.company_id }
  if (data.contact_id !== undefined) out[FIELD_CODES.contactId] = { value: data.contact_id }
  if (data.deal_id !== undefined) out[FIELD_CODES.dealId] = { value: data.deal_id }
  if (data.owner_id !== undefined) out[FIELD_CODES.ownerId] = { value: data.owner_id }
  if (data.due_date !== undefined) out[FIELD_CODES.dueDate] = { value: data.due_date }
  if (data.done !== undefined) out[FIELD_CODES.done] = { value: data.done ? 'on' : 'off' }
  return out
}
