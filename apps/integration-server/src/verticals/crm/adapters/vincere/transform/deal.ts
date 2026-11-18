/**
 * Vincere jobs (positions) → canonical Deal.
 *
 * Field names come from Vincere's OpenAPI spec, https://api.vincere.io/vapi.yaml.
 *
 * - GET /position/search/{matrix_vars} ("Return a list of job records matched
 *   with the search criterias.") returns the `fl` fields requested, and "Only
 *   the fields that have value will be return". Documented fields read here:
 *   `id` "ID of job", `job_title` "Job title", `job_status` "The job's
 *   status", `company_id` "Company ID", `closed_date` "Job closed date",
 *   `forecast_annual_fee` "Forecast annual fee", `forecast_annual_fee_currency`
 *   "Forecast annual fee currency", `created_date` "Created date of job",
 *   `last_update` "Last update timestamp".
 * - GET /position/{id} ("Get a specific job") returns `id`, `job_title`,
 *   `company_id`, `close_date`, `forecast_annual_fee`,
 *   `forecast_annual_fee_currency`, `registration_date` and
 *   `updated_timestamp` among others.
 *
 * `contact_id` on a job is a Vincere *contact* (a client-side person), while
 * this adapter's canonical Contacts are Vincere *candidates*, so it is not
 * mapped to `contact_ids`: the ids would not resolve. It stays in metadata.
 *
 * Value: the forecast annual fee, only when both the amount and a
 * three-letter currency are present. Vincere's currency reference values are
 * lower-case codes ("aud", "aed"; GET /def/currencies), upper-cased here.
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'
import type { Money } from '../../../schema/shared'

/** The `fl` list the search asks for: exactly the fields read below. */
export const POSITION_SEARCH_FIELDS = [
  'id',
  'job_title',
  'job_status',
  'company_id',
  'closed_date',
  'forecast_annual_fee',
  'forecast_annual_fee_currency',
  'created_date',
  'last_update',
] as const

export interface RawVincerePositionSearchItem {
  id: number
  job_title?: string | null
  job_status?: string | null
  company_id?: string | null
  closed_date?: string | null
  forecast_annual_fee?: string | null
  forecast_annual_fee_currency?: string | null
  created_date?: string | null
  last_update?: string | null
  [key: string]: unknown
}

/** GET /position/{id}. */
export interface RawVincereJob {
  id: number
  job_title?: string | null
  company_id?: number | null
  close_date?: string | null
  forecast_annual_fee?: number | string | null
  forecast_annual_fee_currency?: string | null
  registration_date?: string | null
  updated_timestamp?: string | null
  [key: string]: unknown
}

function text(v: string | null | undefined): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined
}

function requireId(raw: { id?: unknown }, what: string): string {
  if (typeof raw.id !== 'number' && typeof raw.id !== 'string') {
    throw new Error(`Vincere ${what} without an id`)
  }
  return String(raw.id)
}

function requireTitle(title: string | null | undefined, id: string): string {
  const t = text(title)
  if (t === undefined) throw new Error(`Vincere job ${id} has no job_title`)
  return t
}

function money(
  amount: number | string | null | undefined,
  currency: string | null | undefined,
): Money | undefined {
  if (amount === null || amount === undefined || amount === '') return undefined
  const n = typeof amount === 'number' ? amount : Number(amount)
  const code = typeof currency === 'string' ? currency.trim().toUpperCase() : ''
  if (!Number.isFinite(n) || n < 0 || !/^[A-Z]{3}$/.test(code)) return undefined
  return { amount: n, currency: code }
}

export function transformPositionSearchItem(raw: RawVincerePositionSearchItem): Deal {
  const id = requireId(raw, 'job search item')
  return {
    id,
    title: requireTitle(raw.job_title, id),
    value: money(raw.forecast_annual_fee, raw.forecast_annual_fee_currency),
    status: text(raw.job_status),
    company_id: text(raw.company_id),
    close_date: toIsoDatetime(raw.closed_date),
    created_at: toIsoDatetime(raw.created_date),
    updated_at: toIsoDatetime(raw.last_update),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformDeal(raw: RawVincereJob): Deal {
  const id = requireId(raw, 'job')
  return {
    id,
    title: requireTitle(raw.job_title, id),
    value: money(raw.forecast_annual_fee, raw.forecast_annual_fee_currency),
    company_id: raw.company_id != null ? String(raw.company_id) : undefined,
    close_date: toIsoDatetime(raw.close_date),
    created_at: toIsoDatetime(raw.registration_date),
    updated_at: toIsoDatetime(raw.updated_timestamp),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (data.title !== undefined) body.job_title = data.title
  if (data.status !== undefined) body.status = data.status
  if (data.close_date !== undefined) body.close_date = data.close_date
  if (data.company_id !== undefined) body.company_id = data.company_id
  if (data.value?.amount !== undefined) {
    body.salary = {
      salary: data.value.amount,
      currency: data.value.currency ?? 'USD',
    }
  }
  return body
}
