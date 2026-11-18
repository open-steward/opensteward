import type { Deal } from '../../../schema/deal'

export interface RawInsightlyDeal {
  OPPORTUNITY_ID: number
  OPPORTUNITY_NAME: string
  BID_AMOUNT?: number
  BID_CURRENCY?: string
  ORGANISATION_ID?: number | null
  PIPELINE_ID?: number | null
  STAGE_ID?: number | null
  OWNER_USER_ID?: number | null
  CLOSE_DATE?: string
  PROBABILITY?: number
  OPPORTUNITY_STATE?: string
  DATE_CREATED_UTC?: string
  DATE_UPDATED_UTC?: string
  [key: string]: unknown
}

function isoUtc(date?: string): string | undefined {
  if (!date) return undefined
  return date.endsWith('Z') ? date : `${date}Z`
}

export function transformDeal(raw: RawInsightlyDeal): Deal {
  return {
    id: String(raw.OPPORTUNITY_ID),
    title: raw.OPPORTUNITY_NAME,
    value: raw.BID_AMOUNT != null
      ? { amount: raw.BID_AMOUNT, currency: raw.BID_CURRENCY ?? 'USD' }
      : undefined,
    company_id: raw.ORGANISATION_ID != null ? String(raw.ORGANISATION_ID) : undefined,
    pipeline_id: raw.PIPELINE_ID != null ? String(raw.PIPELINE_ID) : undefined,
    stage_id: raw.STAGE_ID != null ? String(raw.STAGE_ID) : undefined,
    owner_id: raw.OWNER_USER_ID != null ? String(raw.OWNER_USER_ID) : undefined,
    close_date: raw.CLOSE_DATE,
    probability: raw.PROBABILITY,
    status: raw.OPPORTUNITY_STATE,
    created_at: isoUtc(raw.DATE_CREATED_UTC),
    updated_at: isoUtc(raw.DATE_UPDATED_UTC),
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.OPPORTUNITY_NAME = data.title
  if (data.value?.amount !== undefined) out.BID_AMOUNT = data.value.amount
  if (data.value?.currency !== undefined) out.BID_CURRENCY = data.value.currency
  if (data.company_id !== undefined) out.ORGANISATION_ID = Number(data.company_id)
  if (data.pipeline_id !== undefined) out.PIPELINE_ID = Number(data.pipeline_id)
  if (data.stage_id !== undefined) out.STAGE_ID = Number(data.stage_id)
  if (data.owner_id !== undefined) out.OWNER_USER_ID = Number(data.owner_id)
  if (data.close_date !== undefined) out.CLOSE_DATE = data.close_date
  if (data.probability !== undefined) out.PROBABILITY = data.probability
  if (data.status !== undefined) out.OPPORTUNITY_STATE = data.status
  return out
}
