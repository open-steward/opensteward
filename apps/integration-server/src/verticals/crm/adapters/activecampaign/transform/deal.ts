import type { Deal } from '../../../schema/deal'

export interface RawActiveCampaignDeal {
  id: string | number
  title: string
  value?: string | number | null
  currency?: string
  organization?: string | number | null
  contact?: string | number | null
  group?: string | number | null
  stage?: string | number | null
  owner?: string | number | null
  percent?: string | number | null
  closedate?: string | null
  cdate?: string
  udate?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawActiveCampaignDeal): Deal {
  // AC stores value in cents
  const rawValue = raw.value != null ? Number(raw.value) : undefined
  return {
    id: String(raw.id),
    title: raw.title,
    value: rawValue != null
      ? { amount: rawValue / 100, currency: raw.currency ?? 'USD' }
      : undefined,
    company_id: raw.organization != null && raw.organization !== '' && raw.organization !== '0'
      ? String(raw.organization)
      : undefined,
    contact_ids: raw.contact != null && raw.contact !== '' && raw.contact !== '0'
      ? [String(raw.contact)]
      : undefined,
    pipeline_id: raw.group != null && raw.group !== '' && raw.group !== '0'
      ? String(raw.group)
      : undefined,
    stage_id: raw.stage != null && raw.stage !== '' && raw.stage !== '0'
      ? String(raw.stage)
      : undefined,
    owner_id: raw.owner != null && raw.owner !== '' ? String(raw.owner) : undefined,
    probability: raw.percent != null ? Number(raw.percent) : undefined,
    close_date: raw.closedate ?? undefined,
    created_at: raw.cdate ?? undefined,
    updated_at: raw.udate ?? undefined,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.title = data.title
  // Convert back to cents
  if (data.value?.amount !== undefined) out.value = Math.round(data.value.amount * 100)
  if (data.value?.currency !== undefined) out.currency = data.value.currency
  if (data.company_id !== undefined) out.organization = data.company_id
  if (data.contact_ids?.[0] !== undefined) out.contact = data.contact_ids[0]
  if (data.pipeline_id !== undefined) out.group = data.pipeline_id
  if (data.stage_id !== undefined) out.stage = data.stage_id
  if (data.owner_id !== undefined) out.owner = data.owner_id
  if (data.probability !== undefined) out.percent = data.probability
  if (data.close_date !== undefined) out.closedate = data.close_date
  return out
}
