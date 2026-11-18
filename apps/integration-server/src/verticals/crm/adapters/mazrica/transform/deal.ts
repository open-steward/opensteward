import type { Deal } from '../../../schema/deal'
import { toIsoDatetime } from '@opensteward/shared'

/** Minimal embedded deal-type reference returned inside a Deal object. */
export interface RawMazricaDealTypeRef {
  id?: number
  name?: string
}

export interface RawMazricaDealCustomer {
  id?: number
  name?: string
}

export interface RawMazricaDeal {
  id: number
  name?: string
  amount?: number
  expectedContractDate?: string
  memo?: string
  dealType?: RawMazricaDealTypeRef
  customer?: RawMazricaDealCustomer
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawMazricaDeal): Deal {
  const amount = typeof raw.amount === 'number' ? raw.amount : undefined

  return {
    id: String(raw.id),
    title: raw.name ?? '',
    value: amount != null && !isNaN(amount)
      ? { amount, currency: 'JPY' }
      : undefined,
    company_id: raw.customer?.id != null ? String(raw.customer.id) : undefined,
    close_date: toIsoDatetime(raw.expectedContractDate),
    created_at: toIsoDatetime(raw.createdAt),
    updated_at: toIsoDatetime(raw.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.amount = data.value.amount
  if (data.close_date !== undefined) out.expectedContractDate = data.close_date
  if (data.company_id !== undefined) out.customerId = Number(data.company_id)
  return out
}
