import type { Deal } from '../../../schema/deal'

// SALESmanago doesn't have a native deals/pipeline resource
export interface RawSaleSmanagoOpportunity {
  id?: string
  name?: string
  value?: number
  currency?: string
  stage?: string
  contactId?: string
  ownerId?: string
  closeDate?: string
  createdOn?: number
  modifiedOn?: number
  [key: string]: unknown
}

export function transformDeal(raw: RawSaleSmanagoOpportunity): Deal {
  return {
    id: String(raw.id ?? ''),
    title: raw.name ?? '',
    value: raw.value != null
      ? { amount: raw.value as number, currency: (raw.currency as string | undefined) ?? 'EUR' }
      : undefined,
    stage_id: raw.stage as string | undefined,
    contact_ids: raw.contactId != null ? [String(raw.contactId)] : undefined,
    owner_id: raw.ownerId as string | undefined,
    close_date: raw.closeDate as string | undefined,
    created_at: raw.createdOn != null ? new Date(raw.createdOn as number).toISOString() : undefined,
    updated_at: raw.modifiedOn != null ? new Date(raw.modifiedOn as number).toISOString() : undefined,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.value = data.value.amount
  if (data.value?.currency !== undefined) out.currency = data.value.currency
  if (data.stage_id !== undefined) out.stage = data.stage_id
  if (data.close_date !== undefined) out.closeDate = data.close_date
  return out
}
