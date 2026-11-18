import type { Deal } from '../../../schema/deal'

export interface RawSpotlerDeal {
  id: number
  opportunityname?: string
  value?: number | null
  stageid?: number | null
  accountid?: number | null
  contactid?: number | null
  [key: string]: unknown
}

export function transformDeal(raw: RawSpotlerDeal): Deal {
  return {
    id: String(raw.id),
    title: raw.opportunityname ?? '',
    value: raw.value != null ? { amount: raw.value, currency: 'GBP' } : undefined,
    stage_id: raw.stageid != null ? String(raw.stageid) : undefined,
    company_id: raw.accountid != null ? String(raw.accountid) : undefined,
    contact_ids: raw.contactid != null ? [String(raw.contactid)] : undefined,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.opportunityname = data.title
  if (data.value?.amount !== undefined) out.value = data.value.amount
  if (data.stage_id !== undefined) out.stageid = Number(data.stage_id)
  if (data.company_id !== undefined) out.accountid = Number(data.company_id)
  if (data.contact_ids?.[0] !== undefined) out.contactid = Number(data.contact_ids[0])
  return out
}
