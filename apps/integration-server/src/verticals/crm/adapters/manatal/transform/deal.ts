import { toIsoDatetime } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'

/**
 * Raw Manatal job object from GET /jobs/ or GET /jobs/{id}/.
 * Manatal "jobs" (job requisitions) are the closest analogue to CRM deals.
 */
export interface RawManatalJob {
  id: number
  title?: string
  status?: string
  pipeline?: number | null
  stage?: string | null
  owner?: number | null
  organization?: number | null
  close_date?: string | null
  description?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawManatalJob): Deal {
  return {
    id: String(raw.id),
    title: raw.title ?? '',
    status: raw.status ?? undefined,
    stage: raw.stage ?? undefined,
    pipeline_id: raw.pipeline != null ? String(raw.pipeline) : undefined,
    company_id: raw.organization != null ? String(raw.organization) : undefined,
    owner_id: raw.owner != null ? String(raw.owner) : undefined,
    close_date: toIsoDatetime(raw.close_date),
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.title = data.title
  if (data.status !== undefined) out.status = data.status
  if (data.stage !== undefined) out.stage = data.stage
  if (data.pipeline_id !== undefined) out.pipeline = data.pipeline_id ? Number(data.pipeline_id) : null
  if (data.company_id !== undefined) out.organization = data.company_id ? Number(data.company_id) : null
  if (data.owner_id !== undefined) out.owner = data.owner_id ? Number(data.owner_id) : null
  if (data.close_date !== undefined) out.close_date = data.close_date ?? null
  return out
}
