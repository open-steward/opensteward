/**
 * Transform Cloze project records to/from the canonical Deal schema.
 *
 * Cloze projects serve the "deal / opportunity" role in its CRM model.
 *
 * Project fields (from /v1/projects/find and /v1/projects/get):
 *   direct      — opaque identifier
 *   name        — project title
 *   summary     — description / notes
 *   stage       — lifecycle stage (future, current, pending, won, lost)
 *   segment     — user-defined segment
 *   value       — numeric deal value (currency unspecified at API level)
 *   createdDate — ISO date string (YYYY-MM-DD)
 *   created     — ms epoch
 *   modified    — ms epoch
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'

export interface RawClozeProject {
  direct?: string
  id?: string
  name?: string
  summary?: string
  stage?: string
  segment?: string
  /** Numeric deal value (Cloze stores this as a plain number). */
  value?: number | string
  /** ISO date string YYYY-MM-DD */
  createdDate?: string
  /** ms epoch */
  created?: number | string
  /** ms epoch */
  modified?: number | string
  [key: string]: unknown
}

export function transformDeal(raw: RawClozeProject): Deal {
  const id = raw.direct ?? raw.id ?? ''
  const numericValue = raw.value !== undefined ? Number(raw.value) : undefined
  // Cloze stores deal value in major currency units (e.g. 15000 = $15,000.00).
  // The canonical Money schema requires INTEGER MINOR UNITS (cents), so multiply by 100.
  const minorUnits =
    numericValue !== undefined && !Number.isNaN(numericValue)
      ? Math.round(numericValue * 100)
      : undefined
  return {
    id: String(id),
    title: raw.name ?? '',
    stage: raw.stage,
    value: minorUnits !== undefined
      ? { amount: minorUnits, currency: 'USD' }
      : undefined,
    created_at: toIsoDatetime(raw.created ?? raw.createdDate),
    updated_at: toIsoDatetime(raw.modified),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.stage !== undefined) out.stage = data.stage
  // Canonical amount is in INTEGER MINOR UNITS (cents); Cloze expects major units.
  if (data.value?.amount !== undefined) out.value = data.value.amount / 100
  return out
}
