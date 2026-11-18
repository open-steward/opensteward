/**
 * JobDiva job → canonical Deal transform.
 *
 * In JobDiva, open "jobs" are the placement opportunities — analogous to
 * deals in a CRM. A job has a title, client company, owner, status, and
 * pay rate (used as deal value).
 *
 * Wire field names come from the JobDiva /getJobDetails and
 * /getNewJobRecords endpoints.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'

export interface RawJobdivaJob {
  /** Internal JobDiva job ID. */
  jobid?: string | number
  id?: string | number
  /** JobDiva reference number (human-readable). */
  jobdivaref?: string | number
  /** Job title / position name. */
  jobtitle?: string
  title?: string
  /** Client company ID. */
  clientid?: string | number
  companyid?: string | number
  /** Job status (e.g. Open, Filled, Closed). */
  status?: string
  /** Current pipeline stage label. */
  stage?: string
  stageid?: string | number
  /** Bill rate or salary (used as deal value). */
  billrate?: number
  /** Currency for bill rate. */
  currency?: string
  /** Record owner / recruiter ID. */
  ownerid?: string | number
  /** Expected fill / close date (MM/dd/yyyy or ISO). */
  enddate?: string
  createdat?: string
  modifiedat?: string
  [key: string]: unknown
}

/** Convert a raw JobDiva job record to a canonical Deal. Never throws. */
export function transformDeal(raw: RawJobdivaJob): Deal {
  const id = raw.jobid ?? raw.id
  return {
    id: String(id ?? ''),
    title: raw.jobtitle ?? raw.title ?? '',
    company_id: raw.clientid != null
      ? String(raw.clientid)
      : raw.companyid != null
        ? String(raw.companyid)
        : undefined,
    status: raw.status ?? undefined,
    stage: raw.stage ?? undefined,
    stage_id: raw.stageid != null ? String(raw.stageid) : undefined,
    value:
      raw.billrate != null
        ? { amount: raw.billrate, currency: (raw.currency as string) ?? 'USD' }
        : undefined,
    owner_id: raw.ownerid != null ? String(raw.ownerid) : undefined,
    close_date: toIsoDatetime(raw.enddate),
    created_at: toIsoDatetime(raw.createdat),
    updated_at: toIsoDatetime(raw.modifiedat),
    metadata: raw,
  }
}

/** Convert a partial canonical Deal to a JobDiva job creation request body. */
export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.jobtitle = data.title
  if (data.company_id !== undefined) out.clientid = data.company_id
  if (data.status !== undefined) out.status = data.status
  if (data.value?.amount !== undefined) out.billrate = data.value.amount
  if (data.value?.currency !== undefined) out.currency = data.value.currency
  if (data.close_date !== undefined) out.enddate = data.close_date
  return out
}
