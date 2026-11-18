import { toIsoDatetime } from '@opensteward/shared'
import { limeObjectId } from '../object-id'
import type { Deal } from '../../../schema/deal'

/**
 * System properties: "_id: the id of the limeobject", "_createdtime: the
 * timestamp of the creation time", "_timestamp: the timestamp of the latest
 * update" (https://platform.docs.lime-crm.com/en/latest/development/tutorials/concepts/limetypes-and-limeobjects/).
 * Other fields per the Limeobject API definitions
 * (http://static.lime-crm.com/crm-api-docs/spec/limeobject).
 */
export interface RawLimeCrmDeal {
  _id: number | string
  _createdtime?: string
  _timestamp?: string
  /** "title: \"Deal name\"" */
  name?: string
  /** "title: \"Company\"", "type: integer": the related company's id. */
  company?: number | null
  /** "title: \"Status\"": an option with `id`, `key` and `text`. */
  dealstatus?: { id?: number; key?: string; text?: string } | null
  /**
   * "title: \"Value\"", "type: string". No currency is documented, so the
   * canonical `value` (amount plus currency) is not filled; the raw value
   * stays in metadata.
   */
  value?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawLimeCrmDeal): Deal {
  return {
    id: limeObjectId(raw),
    title: raw.name ?? '',
    stage_id: raw.dealstatus?.key,
    stage: raw.dealstatus?.text,
    company_id: raw.company != null ? String(raw.company) : undefined,
    created_at: toIsoDatetime(raw._createdtime),
    updated_at: toIsoDatetime(raw._timestamp),
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.value = data.value.amount
  if (data.stage_id !== undefined) out.dealstatus = { _id: data.stage_id }
  if (data.company_id !== undefined) out.company = { _id: data.company_id }
  return out
}
