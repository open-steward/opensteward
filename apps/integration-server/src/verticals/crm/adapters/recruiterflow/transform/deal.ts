import type { Deal } from '../../../schema/deal'

/**
 * Recruiterflow job/position object mapped to canonical Deal.
 *
 * Key fields:
 *   id           – numeric job ID
 *   name         – job title / deal name
 *   client_id    – linked client company ID
 *   stage        – current pipeline stage name
 *   stage_id     – current pipeline stage ID
 *   pipeline_id  – pipeline ID
 *   status       – open/closed/on_hold
 *   close_date   – expected close date
 *   owner_id     – owning recruiter ID
 *   created_at   – ISO-8601 creation timestamp
 *   updated_at   – ISO-8601 last-modified timestamp
 */
export interface RawRecruiterflowDeal {
  id: string | number
  name?: string
  client_id?: string | number
  stage?: string
  stage_id?: string | number
  pipeline_id?: string | number
  status?: string
  close_date?: string
  owner_id?: string | number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function toIso(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v) return undefined
  const d = new Date(v)
  return isNaN(d.getTime()) ? undefined : d.toISOString()
}

export function transformDeal(raw: RawRecruiterflowDeal): Deal {
  return {
    id: String(raw.id),
    title: raw.name ?? '',
    company_id: raw.client_id !== undefined ? String(raw.client_id) : undefined,
    stage: raw.stage,
    stage_id: raw.stage_id !== undefined ? String(raw.stage_id) : undefined,
    pipeline_id: raw.pipeline_id !== undefined ? String(raw.pipeline_id) : undefined,
    status: raw.status,
    close_date: toIso(raw.close_date),
    owner_id: raw.owner_id !== undefined ? String(raw.owner_id) : undefined,
    created_at: toIso(raw.created_at),
    updated_at: toIso(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.company_id !== undefined) out.client_id = data.company_id
  if (data.status !== undefined) out.status = data.status
  if (data.stage !== undefined) out.stage = data.stage
  return out
}
