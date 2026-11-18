import type { Deal } from '../../../schema/deal'

export interface RawSellsyDeal {
  id: number | string
  name?: string
  amount?: number | null
  step_id?: number | string | null
  pipeline_id?: number | string | null
  linked_contacts_ids?: Array<number | string>
  linked_company_id?: number | string | null
  owner_id?: number | string | null
  close_date?: string | null
  [key: string]: unknown
}

export function transformDeal(raw: RawSellsyDeal): Deal {
  return {
    id: String(raw.id),
    title: raw.name ?? '',
    value: raw.amount != null ? { amount: raw.amount, currency: 'EUR' } : undefined,
    stage_id: raw.step_id != null ? String(raw.step_id) : undefined,
    pipeline_id: raw.pipeline_id != null ? String(raw.pipeline_id) : undefined,
    contact_ids: raw.linked_contacts_ids?.map(String),
    company_id: raw.linked_company_id != null ? String(raw.linked_company_id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    close_date: raw.close_date ?? undefined,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.amount = data.value.amount
  if (data.stage_id !== undefined) out.step_id = data.stage_id
  if (data.pipeline_id !== undefined) out.pipeline_id = data.pipeline_id
  if (data.contact_ids !== undefined) out.linked_contacts_ids = data.contact_ids
  if (data.company_id !== undefined) out.linked_company_id = data.company_id
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  if (data.close_date !== undefined) out.close_date = data.close_date
  return out
}
