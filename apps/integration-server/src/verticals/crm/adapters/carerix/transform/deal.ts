/**
 * Transform Carerix CRPublication records to/from the canonical Deal type.
 *
 * In Carerix, a CRPublication represents a published vacancy/job posting — the
 * closest analogue to a "deal" in the recruitment CRM context. It has a title,
 * status, pipeline stage, linked company, and date fields.
 *
 * Carerix CRPublication field names (JSON API):
 *   publicationID, id, toVacancy (nested vacancy with title/description),
 *   toStatusNode (pipeline stage), toMedium (publishing channel),
 *   publicationStart, publicationEnd, toCompany (linked company ref),
 *   toUser (owner/responsible user), dateCreated, dateModified
 */

import type { Deal } from '../../../schema/deal'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawCarerixPublication {
  /** Platform-assigned record ID. */
  publicationID?: string | number
  /** May also appear as `id`. */
  id?: string | number
  /** Linked vacancy — contains the vacancy title. */
  toVacancy?: {
    id?: string | number
    title?: string
    name?: string
    description?: string
    salary?: number | string
    currency?: string
    [key: string]: unknown
  } | null
  /** Publication status (DataNode). */
  toStatusNode?: {
    id?: string | number
    name?: string
    [key: string]: unknown
  } | string | null
  /** Linked company. */
  toCompany?: {
    id?: string | number
    name?: string
    [key: string]: unknown
  } | string | null
  /** Responsible user / owner. */
  toUser?: {
    id?: string | number
    [key: string]: unknown
  } | string | null
  /** Publication start date (ISO-8601). */
  publicationStart?: string
  /** Publication end date (ISO-8601) — used as close_date. */
  publicationEnd?: string
  /** ISO-8601 or Carerix date-string of record creation. */
  dateCreated?: string
  /** ISO-8601 or Carerix date-string of last modification. */
  dateModified?: string
  [key: string]: unknown
}

function extractId(
  ref: { id?: string | number; [key: string]: unknown } | string | null | undefined,
): string | undefined {
  if (!ref) return undefined
  if (typeof ref === 'string') return ref || undefined
  return ref.id != null ? String(ref.id) : undefined
}

function extractStatusName(
  node: RawCarerixPublication['toStatusNode'],
): string | undefined {
  if (!node) return undefined
  if (typeof node === 'string') return node || undefined
  return node.name ?? undefined
}

export function transformDeal(raw: RawCarerixPublication): Deal {
  const id = raw.publicationID ?? raw.id
  const vacancyTitle = raw.toVacancy?.title ?? raw.toVacancy?.name
  const salary = raw.toVacancy?.salary
  // Carerix expresses salary in major units (e.g. EUR 80000). Canonical
  // Money.amount is INTEGER MINOR UNITS (cents). Multiply by 100.
  const salaryMajor = salary != null ? parseFloat(String(salary)) : undefined
  const salaryMinor = salaryMajor != null && !isNaN(salaryMajor)
    ? Math.round(salaryMajor * 100)
    : undefined
  const rawCurrency = raw.toVacancy?.currency
  const currency = typeof rawCurrency === 'string' && rawCurrency.length === 3
    ? rawCurrency.toUpperCase()
    : 'EUR'
  const stageId = extractId(raw.toStatusNode as { id?: string | number } | null)
  const stageName = extractStatusName(raw.toStatusNode)
  const companyId = extractId(raw.toCompany as { id?: string | number } | null)
  const ownerId = extractId(raw.toUser as { id?: string | number } | null)

  return {
    id: String(id ?? ''),
    title: vacancyTitle ?? String(id ?? ''),
    value: salaryMinor !== undefined
      ? { amount: salaryMinor, currency }
      : undefined,
    stage_id: stageId,
    stage: stageName,
    company_id: companyId,
    owner_id: ownerId,
    close_date: toIsoDatetime(raw.publicationEnd),
    created_at: toIsoDatetime(raw.dateCreated),
    updated_at: toIsoDatetime(raw.dateModified),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined || data.value !== undefined) {
    const vacancy: Record<string, unknown> = {}
    if (data.title !== undefined) vacancy.title = data.title
    if (data.value !== undefined) {
      // Convert minor units (cents) → major units for Carerix.
      vacancy.salary = data.value.amount / 100
      vacancy.currency = data.value.currency
    }
    out.toVacancy = vacancy
  }
  if (data.close_date !== undefined) out.publicationEnd = data.close_date
  if (data.stage_id !== undefined) out.toStatusNode = data.stage_id
  if (data.company_id !== undefined) out.toCompany = data.company_id
  if (data.owner_id !== undefined) out.toUser = data.owner_id
  return out
}
