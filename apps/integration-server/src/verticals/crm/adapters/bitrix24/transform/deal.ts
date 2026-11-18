import type { Deal } from '../../../schema/deal'

export interface RawBitrix24Deal {
  ID: string
  TITLE: string
  OPPORTUNITY?: string | null
  CURRENCY_ID?: string | null
  COMPANY_ID?: string | null
  CONTACT_ID?: string | null
  STAGE_ID?: string | null
  PIPELINE_ID?: string | null
  ASSIGNED_BY_ID?: string | null
  CLOSEDATE?: string | null
  PROBABILITY?: string | number | null
  DATE_CREATE?: string
  DATE_MODIFY?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawBitrix24Deal): Deal {
  const amount = raw.OPPORTUNITY != null ? parseFloat(String(raw.OPPORTUNITY)) : undefined
  const probability = raw.PROBABILITY != null ? Number(raw.PROBABILITY) : undefined

  return {
    id: String(raw.ID),
    title: raw.TITLE,
    value: amount != null && !isNaN(amount)
      ? { amount, currency: raw.CURRENCY_ID ?? 'USD' }
      : undefined,
    company_id: raw.COMPANY_ID ? String(raw.COMPANY_ID) : undefined,
    contact_ids: raw.CONTACT_ID ? [String(raw.CONTACT_ID)] : undefined,
    stage_id: raw.STAGE_ID ? String(raw.STAGE_ID) : undefined,
    pipeline_id: raw.PIPELINE_ID ? String(raw.PIPELINE_ID) : undefined,
    owner_id: raw.ASSIGNED_BY_ID ? String(raw.ASSIGNED_BY_ID) : undefined,
    close_date: raw.CLOSEDATE ?? undefined,
    probability: probability != null && !isNaN(probability) ? probability : undefined,
    created_at: raw.DATE_CREATE,
    updated_at: raw.DATE_MODIFY,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  if (data.title !== undefined) fields.TITLE = data.title
  if (data.value?.amount !== undefined) fields.OPPORTUNITY = String(data.value.amount)
  if (data.value?.currency !== undefined) fields.CURRENCY_ID = data.value.currency
  if (data.company_id !== undefined) fields.COMPANY_ID = data.company_id
  if (data.contact_ids?.[0] !== undefined) fields.CONTACT_ID = data.contact_ids[0]
  if (data.stage_id !== undefined) fields.STAGE_ID = data.stage_id
  if (data.pipeline_id !== undefined) fields.PIPELINE_ID = data.pipeline_id
  if (data.owner_id !== undefined) fields.ASSIGNED_BY_ID = data.owner_id
  if (data.close_date !== undefined) fields.CLOSEDATE = data.close_date
  if (data.probability !== undefined) fields.PROBABILITY = String(data.probability)
  return fields
}
