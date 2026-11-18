import type { Deal } from '../../../schema/deal'

export interface RawRetailCrmOrder {
  id: number | string
  number?: string | number
  summ?: number | null
  status?: string
  customerId?: number | string | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawRetailCrmOrder): Deal {
  return {
    id: String(raw.id),
    title: raw.number ? `Order #${raw.number}` : `Order ${raw.id}`,
    value: raw.summ != null ? { amount: raw.summ, currency: 'RUB' } : undefined,
    status: raw.status,
    contact_ids: raw.customerId != null ? [String(raw.customerId)] : undefined,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.value !== undefined) out.summ = data.value?.amount
  if (data.status !== undefined) out.status = data.status
  if (data.contact_ids?.[0] !== undefined) out.customerId = Number(data.contact_ids[0])
  return out
}
