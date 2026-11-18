import type { Deal } from '../../../schema/deal'

// Recruit CRM Deal (Job/Pipeline item) entity
// Docs: https://docs.recruitcrm.io/
export interface RawRecruitCrmDeal {
  id?: string | number
  slug?: string
  title?: string
  name?: string
  salary_from?: number
  salary_to?: number
  currency?: string
  status?: string
  pipeline_stage_id?: string | number
  pipeline_id?: string | number
  company_id?: string | number
  contact_id?: string | number
  owner?: { id?: string | number; slug?: string } | string | number
  close_date?: string
  created_on?: string
  updated_on?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawRecruitCrmDeal): Deal {
  const ownerId = typeof raw.owner === 'object' && raw.owner !== null
    ? raw.owner.id ?? raw.owner.slug
    : raw.owner
  const amount = raw.salary_from != null ? raw.salary_from : undefined
  return {
    id: String(raw.id ?? raw.slug ?? ''),
    title: raw.title ?? raw.name ?? '',
    value: amount != null
      ? { amount, currency: (raw.currency as string | undefined) ?? 'USD' }
      : undefined,
    status: raw.status,
    stage_id: raw.pipeline_stage_id != null ? String(raw.pipeline_stage_id) : undefined,
    pipeline_id: raw.pipeline_id != null ? String(raw.pipeline_id) : undefined,
    company_id: raw.company_id != null ? String(raw.company_id) : undefined,
    contact_ids: raw.contact_id != null ? [String(raw.contact_id)] : undefined,
    owner_id: ownerId != null ? String(ownerId) : undefined,
    close_date: raw.close_date,
    created_at: raw.created_on,
    updated_at: raw.updated_on,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.title = data.title
  if (data.value?.amount !== undefined) out.salary_from = data.value.amount
  if (data.value?.currency !== undefined) out.currency = data.value.currency
  if (data.status !== undefined) out.status = data.status
  if (data.company_id !== undefined) out.company_id = data.company_id
  if (data.contact_ids?.[0] !== undefined) out.contact_id = data.contact_ids[0]
  if (data.close_date !== undefined) out.close_date = data.close_date
  return out
}
