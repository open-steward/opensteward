import type { Deal } from '../../../schema/deal'

export interface RawCopperDeal {
  id: number
  name: string
  monetary_value?: number | null
  company_id?: number | null
  primary_contact_id?: number | null
  pipeline_stage_id?: number | null
  pipeline_id?: number | null
  assignee_id?: number | null
  close_date?: number | null
  status?: string
  date_created?: number
  date_modified?: number
  [key: string]: unknown
}

function unixToIso(ts: number | undefined | null): string | undefined {
  if (ts == null) return undefined
  return new Date(ts * 1000).toISOString()
}

function unixToDateString(ts: number | undefined | null): string | undefined {
  if (ts == null) return undefined
  return new Date(ts * 1000).toISOString().substring(0, 10)
}

export function transformDeal(raw: RawCopperDeal): Deal {
  return {
    id: String(raw.id),
    title: raw.name,
    value: raw.monetary_value != null
      ? { amount: raw.monetary_value, currency: 'USD' }
      : undefined,
    company_id: raw.company_id != null ? String(raw.company_id) : undefined,
    contact_ids: raw.primary_contact_id != null ? [String(raw.primary_contact_id)] : undefined,
    stage_id: raw.pipeline_stage_id != null ? String(raw.pipeline_stage_id) : undefined,
    pipeline_id: raw.pipeline_id != null ? String(raw.pipeline_id) : undefined,
    owner_id: raw.assignee_id != null ? String(raw.assignee_id) : undefined,
    close_date: unixToDateString(raw.close_date),
    status: raw.status,
    created_at: unixToIso(raw.date_created),
    updated_at: unixToIso(raw.date_modified),
    metadata: raw,
  }
}

function isoToUnix(dateStr: string | undefined): number | undefined {
  if (!dateStr) return undefined
  return Math.floor(new Date(dateStr).getTime() / 1000)
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.monetary_value = data.value.amount
  if (data.company_id !== undefined) out.company_id = Number(data.company_id)
  if (data.contact_ids?.[0] !== undefined) out.primary_contact_id = Number(data.contact_ids[0])
  if (data.stage_id !== undefined) out.pipeline_stage_id = Number(data.stage_id)
  if (data.pipeline_id !== undefined) out.pipeline_id = Number(data.pipeline_id)
  if (data.owner_id !== undefined) out.assignee_id = Number(data.owner_id)
  if (data.close_date !== undefined) out.close_date = isoToUnix(data.close_date)
  if (data.status !== undefined) out.status = data.status
  return out
}
