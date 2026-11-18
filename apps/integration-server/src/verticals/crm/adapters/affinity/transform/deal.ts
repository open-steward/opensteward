import type { Deal } from '../../../schema/deal'

export interface RawAffinityDeal {
  id: number
  name: string
  organization_ids?: number[]
  person_ids?: number[]
  list_entry_id?: number | null
  stage_id?: number | null
  [key: string]: unknown
}

export function transformDeal(raw: RawAffinityDeal): Deal {
  return {
    id: String(raw.id),
    title: raw.name,
    company_id: raw.organization_ids?.[0] != null
      ? String(raw.organization_ids[0])
      : undefined,
    contact_ids: raw.person_ids?.[0] != null
      ? [String(raw.person_ids[0])]
      : undefined,
    pipeline_id: raw.list_entry_id != null ? String(raw.list_entry_id) : undefined,
    stage_id: raw.stage_id != null ? String(raw.stage_id) : undefined,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.company_id !== undefined) out.organization_ids = [Number(data.company_id)]
  if (data.contact_ids?.[0] !== undefined) out.person_ids = [Number(data.contact_ids[0])]
  if (data.stage_id !== undefined) out.stage_id = Number(data.stage_id)
  return out
}
