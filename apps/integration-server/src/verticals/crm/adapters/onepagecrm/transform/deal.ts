import type { Deal } from '../../../schema/deal'

export interface RawOnePageCrmDeal {
  id?: string | number
  name?: string
  status?: string
  stage?: string
  amount?: number
  currency?: string
  contact_id?: string | number
  close_date?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawOnePageCrmDeal): Deal {
  return {
    id: String(raw.id ?? ''),
    title: raw.name ?? '',
    status: raw.status ?? undefined,
    stage: raw.stage ?? undefined,
    value: raw.amount != null ? { amount: raw.amount, currency: raw.currency ?? 'USD' } : undefined,
    contact_ids: raw.contact_id != null ? [String(raw.contact_id)] : undefined,
    close_date: raw.close_date ?? undefined,
    created_at: raw.created_at ?? undefined,
    updated_at: raw.updated_at ?? undefined,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out['name'] = data.title
  if (data.status !== undefined) out['status'] = data.status
  if (data.stage !== undefined) out['stage'] = data.stage
  if (data.value?.amount !== undefined) out['amount'] = data.value.amount
  if (data.close_date !== undefined) out['close_date'] = data.close_date
  if (data.contact_ids?.[0] !== undefined) out['contact_id'] = data.contact_ids[0]
  return out
}
