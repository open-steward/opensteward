import type { Deal } from '../../../schema/deal'
import type { RagicRecord } from '../client'

// NOTE: Ragic field names are user-configured per sheet.
// The field names below are common defaults for a deals sheet.
const FIELDS = {
  title: 'Deal Name',
  amount: 'Amount',
  currency: 'Currency',
  status: 'Status',
  stageId: 'Stage',
  contactIds: 'Contact IDs',
  companyId: 'Company ID',
  ownerId: 'Owner ID',
  closeDate: 'Close Date',
  createdAt: 'Created Date',
  updatedAt: 'Updated Date',
} as const

function fieldValue(raw: RagicRecord, field: string): string | undefined {
  const v = raw[field]
  if (v == null || v === '') return undefined
  return String(v)
}

export function transformDeal(raw: RagicRecord): Deal {
  const amountStr = fieldValue(raw, FIELDS.amount)
  const amount = amountStr != null ? parseFloat(amountStr) : undefined
  const currency = fieldValue(raw, FIELDS.currency) ?? 'USD'
  const contactIdsRaw = fieldValue(raw, FIELDS.contactIds)
  const contact_ids = contactIdsRaw
    ? contactIdsRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : []

  return {
    id: raw._ragic_id != null ? String(raw._ragic_id) : '',
    title: fieldValue(raw, FIELDS.title) ?? '',
    value: amount != null ? { amount, currency } : undefined,
    status: fieldValue(raw, FIELDS.status),
    stage_id: fieldValue(raw, FIELDS.stageId),
    contact_ids,
    company_id: fieldValue(raw, FIELDS.companyId),
    owner_id: fieldValue(raw, FIELDS.ownerId),
    close_date: fieldValue(raw, FIELDS.closeDate),
    created_at: fieldValue(raw, FIELDS.createdAt),
    updated_at: fieldValue(raw, FIELDS.updatedAt),
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  // TODO: field names must match the user's Ragic deals sheet configuration
  if (data.title !== undefined) out[FIELDS.title] = data.title
  if (data.value?.amount !== undefined) out[FIELDS.amount] = data.value.amount
  if (data.status !== undefined) out[FIELDS.status] = data.status
  if (data.stage_id !== undefined) out[FIELDS.stageId] = data.stage_id
  if (data.contact_ids !== undefined) out[FIELDS.contactIds] = data.contact_ids.join(',')
  if (data.company_id !== undefined) out[FIELDS.companyId] = data.company_id
  if (data.owner_id !== undefined) out[FIELDS.ownerId] = data.owner_id
  if (data.close_date !== undefined) out[FIELDS.closeDate] = data.close_date
  return out
}
