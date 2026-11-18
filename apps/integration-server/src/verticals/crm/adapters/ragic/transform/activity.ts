import type { Activity } from '../../../schema/activity'
import type { RagicRecord } from '../client'

// NOTE: Ragic field names are user-configured per sheet.
// These defaults must match the user's Ragic activities sheet configuration.
const FIELDS = {
  type: 'Activity Type',
  subject: 'Subject',
  companyId: 'Company ID',
  contactId: 'Contact ID',
  dealId: 'Deal ID',
  ownerId: 'Owner ID',
  dueDate: 'Due Date',
  done: 'Done',
  createdAt: 'Created Date',
  updatedAt: 'Updated Date',
} as const

function fieldValue(raw: RagicRecord, field: string): string | undefined {
  const v = raw[field]
  if (v == null || v === '') return undefined
  return String(v)
}

export function transformActivity(raw: RagicRecord): Activity {
  const doneRaw = fieldValue(raw, FIELDS.done)
  return {
    id: raw._ragic_id != null ? String(raw._ragic_id) : '',
    type: fieldValue(raw, FIELDS.type),
    subject: fieldValue(raw, FIELDS.subject),
    company_id: fieldValue(raw, FIELDS.companyId),
    contact_id: fieldValue(raw, FIELDS.contactId),
    deal_id: fieldValue(raw, FIELDS.dealId),
    owner_id: fieldValue(raw, FIELDS.ownerId),
    due_date: fieldValue(raw, FIELDS.dueDate),
    done: doneRaw === 'true' || doneRaw === '1' || doneRaw === 'Yes',
    created_at: fieldValue(raw, FIELDS.createdAt),
    updated_at: fieldValue(raw, FIELDS.updatedAt),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  // TODO: field names must match the user's Ragic activities sheet configuration
  if (data.type !== undefined) out[FIELDS.type] = data.type
  if (data.subject !== undefined) out[FIELDS.subject] = data.subject
  if (data.company_id !== undefined) out[FIELDS.companyId] = data.company_id
  if (data.contact_id !== undefined) out[FIELDS.contactId] = data.contact_id
  if (data.deal_id !== undefined) out[FIELDS.dealId] = data.deal_id
  if (data.owner_id !== undefined) out[FIELDS.ownerId] = data.owner_id
  if (data.due_date !== undefined) out[FIELDS.dueDate] = data.due_date
  if (data.done !== undefined) out[FIELDS.done] = data.done ? 'Yes' : 'No'
  return out
}
