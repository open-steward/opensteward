import type { Deal } from '../../../schema/deal'

export interface RawBiginDeal {
  id: string
  Pipeline_Name?: string
  Closing_Date?: string | null
  Amount?: number | null
  Stage?: string
  Pipeline?: { id: string; name?: string } | null
  Contact_Name?: { id: string; name?: string } | null
  Account_Name?: { id: string; name?: string } | null
  Owner?: { id: string } | null
  Created_Time?: string
  Modified_Time?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawBiginDeal): Deal {
  return {
    id: String(raw.id),
    title: raw.Pipeline_Name ?? '',
    value: raw.Amount != null ? { amount: raw.Amount, currency: 'USD' } : undefined,
    status: raw.Stage ?? undefined,
    pipeline_id: raw.Pipeline?.id != null ? String(raw.Pipeline.id) : undefined,
    contact_ids: raw.Contact_Name?.id != null ? [String(raw.Contact_Name.id)] : undefined,
    company_id: raw.Account_Name?.id != null ? String(raw.Account_Name.id) : undefined,
    owner_id: raw.Owner?.id != null ? String(raw.Owner.id) : undefined,
    close_date: raw.Closing_Date ?? undefined,
    created_at: raw.Created_Time,
    updated_at: raw.Modified_Time,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.Pipeline_Name = data.title
  if (data.value?.amount !== undefined) out.Amount = data.value.amount
  if (data.status !== undefined) out.Stage = data.status
  if (data.close_date !== undefined) out.Closing_Date = data.close_date
  return out
}
