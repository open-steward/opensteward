import type { Deal } from '../../../schema/deal'

export interface RawWeclappSalesOpportunity {
  id: string
  name?: string
  forecastRevenue?: number | null
  salesStageId?: string | null
  customerId?: string | null
  responsibleUserId?: string | null
  [key: string]: unknown
}

export function transformDeal(raw: RawWeclappSalesOpportunity): Deal {
  return {
    id: String(raw.id),
    title: raw.name ?? '',
    value: raw.forecastRevenue != null ? { amount: raw.forecastRevenue, currency: 'EUR' } : undefined,
    stage_id: raw.salesStageId ? String(raw.salesStageId) : undefined,
    contact_ids: raw.customerId ? [String(raw.customerId)] : undefined,
    owner_id: raw.responsibleUserId ? String(raw.responsibleUserId) : undefined,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value !== undefined) out.forecastRevenue = data.value?.amount
  if (data.stage_id !== undefined) out.salesStageId = data.stage_id
  if (data.contact_ids?.[0] !== undefined) out.customerId = data.contact_ids[0]
  if (data.owner_id !== undefined) out.responsibleUserId = data.owner_id
  return out
}
