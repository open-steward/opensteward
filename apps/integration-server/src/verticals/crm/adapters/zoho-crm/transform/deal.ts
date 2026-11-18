import type { Deal } from '../../../schema/deal'

export interface RawZohoDeal {
  id: string
  Deal_Name?: string
  Amount?: number | string | null
  Account_Name?: { id: string; name?: string } | null
  Contact_Name?: { id: string; name?: string } | null
  Stage?: string
  Pipeline?: string
  Owner?: { id: string; name?: string } | null
  Closing_Date?: string
  Probability?: number | string | null
  Created_Time?: string
  Modified_Time?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawZohoDeal): Deal {
  const amount = raw.Amount != null ? parseFloat(String(raw.Amount)) : undefined
  const probability = raw.Probability != null
    ? parseFloat(String(raw.Probability))
    : undefined

  return {
    id: String(raw.id),
    title: raw.Deal_Name ?? '',
    value: amount != null && !isNaN(amount)
      ? { amount, currency: 'USD' }
      : undefined,
    company_id: raw.Account_Name?.id != null ? String(raw.Account_Name.id) : undefined,
    contact_ids: raw.Contact_Name?.id != null ? [String(raw.Contact_Name.id)] : undefined,
    stage_id: raw.Stage ?? undefined,
    pipeline_id: raw.Pipeline ?? undefined,
    owner_id: raw.Owner?.id != null ? String(raw.Owner.id) : undefined,
    close_date: raw.Closing_Date ?? undefined,
    probability: probability != null && !isNaN(probability) ? probability : undefined,
    created_at: raw.Created_Time,
    updated_at: raw.Modified_Time,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const record: Record<string, unknown> = {}
  if (data.title !== undefined) record.Deal_Name = data.title
  if (data.value?.amount !== undefined) record.Amount = data.value.amount
  if (data.stage_id !== undefined) record.Stage = data.stage_id
  if (data.pipeline_id !== undefined) record.Pipeline = data.pipeline_id
  if (data.close_date !== undefined) record.Closing_Date = data.close_date
  if (data.probability !== undefined) record.Probability = data.probability
  return record
}
