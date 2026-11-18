/**
 * JobAdder Job (order) ↔ canonical Deal.
 *
 * In JobAdder an open job requisition is the closest analogue to a CRM "deal".
 * Maps GET /jobs / GET /jobs/{jobId} responses.
 *
 * API fields (camelCase on the wire):
 *   jobId, jobTitle,
 *   company.{ companyId, name },
 *   contact.{ contactId, firstName, lastName },
 *   status.{ statusId, name, active },
 *   salary.{ rateLow, rateHigh, ratePer, currency },
 *   owner.{ userId },
 *   expiresAt, createdAt, updatedAt
 */

import type { Deal } from '../../../schema/deal'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawJobAdderJob {
  jobId: number | string
  jobTitle?: string
  company?: {
    companyId?: number | string
    name?: string
    [key: string]: unknown
  }
  contact?: {
    contactId?: number | string
    firstName?: string
    lastName?: string
    [key: string]: unknown
  }
  status?: {
    statusId?: number | string
    name?: string
    active?: boolean
    [key: string]: unknown
  }
  salary?: {
    rateLow?: number
    rateHigh?: number
    ratePer?: string
    currency?: string
    [key: string]: unknown
  }
  owner?: {
    userId?: number | string
    name?: string
    [key: string]: unknown
  }
  expiresAt?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawJobAdderJob): Deal {
  // Use rateHigh as the deal value, falling back to rateLow
  const salaryAmount = raw.salary?.rateHigh ?? raw.salary?.rateLow
  const currency = raw.salary?.currency ?? 'USD'

  return {
    id: String(raw.jobId),
    title: raw.jobTitle ?? '',
    value: salaryAmount != null && !isNaN(Number(salaryAmount))
      ? { amount: Number(salaryAmount), currency }
      : undefined,
    status: raw.status?.active === false ? 'closed' : raw.status?.name ?? undefined,
    stage: raw.status?.name ?? undefined,
    stage_id: raw.status?.statusId != null ? String(raw.status.statusId) : undefined,
    company_id: raw.company?.companyId != null ? String(raw.company.companyId) : undefined,
    contact_ids: raw.contact?.contactId != null ? [String(raw.contact.contactId)] : undefined,
    owner_id: raw.owner?.userId != null ? String(raw.owner.userId) : undefined,
    close_date: toIsoDatetime(raw.expiresAt),
    created_at: toIsoDatetime(raw.createdAt),
    updated_at: toIsoDatetime(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.jobTitle = data.title
  if (data.value?.amount !== undefined) {
    out.salary = {
      rateLow: data.value.amount,
      rateHigh: data.value.amount,
      currency: data.value.currency ?? 'USD',
    }
  }
  if (data.close_date !== undefined) out.expiresAt = data.close_date
  return out
}
