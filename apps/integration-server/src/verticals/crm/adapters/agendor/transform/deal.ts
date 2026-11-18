import type { Deal } from '../../../schema/deal'

export interface RawAgendorDeal {
  id: number | string
  title?: string
  value?: number | null
  status?: string
  funnel_stage?: { id: number | string } | null
  funnel?: { id: number | string } | null
  person?: { id: number | string } | null
  organization?: { id: number | string } | null
  owner?: { id: number | string } | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawAgendorDeal): Deal {
  return {
    id: String(raw.id),
    title: raw.title ?? '',
    value: raw.value != null ? { amount: raw.value, currency: 'BRL' } : undefined,
    status: raw.status,
    stage_id: raw.funnel_stage?.id != null ? String(raw.funnel_stage.id) : undefined,
    pipeline_id: raw.funnel?.id != null ? String(raw.funnel.id) : undefined,
    contact_ids: raw.person?.id != null ? [String(raw.person.id)] : undefined,
    company_id: raw.organization?.id != null ? String(raw.organization.id) : undefined,
    owner_id: raw.owner?.id != null ? String(raw.owner.id) : undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.title = data.title
  if (data.value !== undefined) out.value = data.value?.amount
  if (data.status !== undefined) out.status = data.status
  if (data.stage_id !== undefined) out.funnel_stage_id = Number(data.stage_id)
  if (data.pipeline_id !== undefined) out.funnel_id = Number(data.pipeline_id)
  if (data.contact_ids?.[0] !== undefined) out.person_id = Number(data.contact_ids[0])
  if (data.company_id !== undefined) out.organization_id = Number(data.company_id)
  if (data.owner_id !== undefined) out.owner_id = Number(data.owner_id)
  return out
}
