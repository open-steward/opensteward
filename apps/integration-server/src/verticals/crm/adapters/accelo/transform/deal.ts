import { toIsoDatetime } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'

/**
 * Raw Accelo prospect (deal/sale) object as returned by GET /prospects or GET /prospects/{id}.
 *
 * In Accelo, sales opportunities are called "prospects".
 *
 * Fields: id, title, value, status, type, probability, manager_id, contact_id,
 *         company_id, date_created, date_modified.
 */
export interface RawAcceloProspect {
  id: string | number
  title?: string
  value?: string | number
  /** Accelo probability is typically 1–5 scale or a percentage string. */
  probability?: string | number | { id: string | number; title?: string; percentage?: string | number; [key: string]: unknown }
  status?: string | number | { id: string | number; title?: string; [key: string]: unknown }
  type?: string | number | { id: string | number; title?: string; [key: string]: unknown }
  manager_id?: string | number
  contact_id?: string | number
  company_id?: string | number
  date_created?: string | number
  date_modified?: string | number
  [key: string]: unknown
}

/** Normalise Accelo's probability field to a 0–100 percentage. */
function normaliseProbability(
  prob: RawAcceloProspect['probability'],
): number | undefined {
  if (prob == null) return undefined
  // If it's an object with a percentage field, use that
  if (typeof prob === 'object' && prob.percentage != null) {
    const pct = parseFloat(String(prob.percentage))
    return !isNaN(pct) ? Math.min(100, Math.max(0, pct)) : undefined
  }
  // Numeric or string — treat as percentage directly if >1, or 0–1 fraction
  const raw = typeof prob === 'object' ? undefined : parseFloat(String(prob))
  if (raw == null || isNaN(raw)) return undefined
  // Accelo uses 1–5 scale for probability objects; a plain number may already be %
  // We can't distinguish without context — treat as % if ≥ 1, clamp to [0,100]
  return Math.min(100, Math.max(0, raw))
}

/**
 * Convert Accelo major-unit deal value to canonical integer minor units (cents).
 * Accelo stores prospect value as a major-unit decimal (e.g. "50000" = $50 000.00).
 * The canonical Money.amount is integer minor units (e.g. 5_000_000 = $50 000.00).
 */
function toMinorUnits(raw: string | number | undefined): number | undefined {
  if (raw == null) return undefined
  const major = parseFloat(String(raw))
  if (isNaN(major)) return undefined
  return Math.round(major * 100)
}

/**
 * Convert canonical integer minor units back to Accelo major-unit string.
 */
function toMajorUnits(minor: number | undefined): string | undefined {
  if (minor == null) return undefined
  return (minor / 100).toFixed(2)
}

export function transformDeal(raw: RawAcceloProspect): Deal {
  const value = toMinorUnits(raw.value != null ? raw.value : undefined)

  let contactIds: string[] | undefined
  if (raw.contact_id != null) {
    contactIds = [String(raw.contact_id)]
  }

  const statusRaw = raw.status
  let statusLabel: string | undefined
  if (statusRaw != null) {
    if (typeof statusRaw === 'object') {
      statusLabel = statusRaw.title ?? String(statusRaw.id)
    } else {
      statusLabel = String(statusRaw)
    }
  }

  return {
    id: String(raw.id),
    title: raw.title ?? '',
    value: value != null ? { amount: value, currency: 'USD' } : undefined,
    status: statusLabel,
    owner_id: raw.manager_id != null ? String(raw.manager_id) : undefined,
    contact_ids: contactIds,
    company_id: raw.company_id != null ? String(raw.company_id) : undefined,
    probability: normaliseProbability(raw.probability),
    created_at: toIsoDatetime(raw.date_created),
    updated_at: toIsoDatetime(raw.date_modified),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.title = data.title
  if (data.value?.amount !== undefined) out.value = toMajorUnits(data.value.amount)
  if (data.owner_id !== undefined) out.manager_id = data.owner_id
  if (data.company_id !== undefined) out.company_id = data.company_id
  if (data.contact_ids?.[0] !== undefined) out.contact_id = data.contact_ids[0]
  if (data.probability !== undefined) out.probability = String(data.probability)
  return out
}
