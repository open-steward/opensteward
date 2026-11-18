import type { Deal } from '../../../schema/deal'
import type { KintoneRecord } from '../client'

// NOTE: Kintone field codes are user-configured per app.
// The field codes below are common defaults — they must match
// the actual field codes in the user's Kintone deals app.
const FIELD_CODES = {
  title: 'deal_name',        // Text field for deal name
  amount: 'amount',          // Number field for deal amount
  currency: 'currency',      // Text field for currency code
  status: 'status',          // Dropdown/Text field for deal status
  stageId: 'stage',          // Dropdown/Text field for deal stage
  contactIds: 'contact_ids', // Text field for contact IDs (comma-separated)
  companyId: 'company_id',   // Text/Number field for associated company
  ownerId: 'owner_id',       // Text/Number field for owner
  closeDate: 'close_date',   // Date field for expected close date
  createdAt: '作成日時',      // Kintone built-in creation datetime
  updatedAt: '更新日時',      // Kintone built-in update datetime
} as const

function fieldValue(raw: KintoneRecord, code: string): string | undefined {
  const v = raw[code]?.value
  if (v == null || v === '') return undefined
  return String(v)
}

export function transformDeal(raw: KintoneRecord): Deal {
  const amountStr = fieldValue(raw, FIELD_CODES.amount)
  const amount = amountStr != null ? parseFloat(amountStr) : undefined
  const currency = fieldValue(raw, FIELD_CODES.currency) ?? 'JPY'
  const contactIdsRaw = fieldValue(raw, FIELD_CODES.contactIds)
  const contact_ids = contactIdsRaw
    ? contactIdsRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : []

  return {
    id: raw.$id?.value,
    title: fieldValue(raw, FIELD_CODES.title) ?? '',
    value: amount != null ? { amount, currency } : undefined,
    status: fieldValue(raw, FIELD_CODES.status),
    stage_id: fieldValue(raw, FIELD_CODES.stageId),
    contact_ids,
    company_id: fieldValue(raw, FIELD_CODES.companyId),
    owner_id: fieldValue(raw, FIELD_CODES.ownerId),
    close_date: fieldValue(raw, FIELD_CODES.closeDate),
    created_at: fieldValue(raw, FIELD_CODES.createdAt),
    updated_at: fieldValue(raw, FIELD_CODES.updatedAt),
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, { value: unknown }> {
  const out: Record<string, { value: unknown }> = {}
  // TODO: field codes must match the user's Kintone deals app configuration
  if (data.title !== undefined) out[FIELD_CODES.title] = { value: data.title }
  if (data.value?.amount !== undefined) out[FIELD_CODES.amount] = { value: data.value.amount }
  if (data.status !== undefined) out[FIELD_CODES.status] = { value: data.status }
  if (data.stage_id !== undefined) out[FIELD_CODES.stageId] = { value: data.stage_id }
  if (data.contact_ids !== undefined) out[FIELD_CODES.contactIds] = { value: data.contact_ids.join(',') }
  if (data.company_id !== undefined) out[FIELD_CODES.companyId] = { value: data.company_id }
  if (data.owner_id !== undefined) out[FIELD_CODES.ownerId] = { value: data.owner_id }
  if (data.close_date !== undefined) out[FIELD_CODES.closeDate] = { value: data.close_date }
  return out
}
