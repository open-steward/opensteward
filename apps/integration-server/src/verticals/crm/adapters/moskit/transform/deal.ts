import { toIsoDatetime } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'
import { refId, refIds, soleRefId, type MoskitEntityId } from '../entity'

/**
 * Deal.v2.yaml ("Negócio"), the fields read here.
 * https://stoplight.io/api/v1/projects/moskit/api-v2/nodes/models/Deal.v2.yaml
 *
 * `price` is documented in cents ("os valores de preço são representados em
 * centavos (Ex. 1000 = R$ 10,00)"), but the model has no currency field, so
 * the canonical `value` is omitted and `price` stays in `metadata`.
 *
 * The Deal model has no pipeline reference, so `pipeline_id` is not set here.
 * It is reachable only through `stage.id` and Stage.v2.yaml's `pipeline`,
 * which would need a whole GET /stages walk on every deal read.
 */
export interface RawMoskitDeal {
  id: number
  createdBy?: MoskitEntityId | null
  responsible?: MoskitEntityId | null
  dateCreated?: string
  name?: string
  previsionCloseDate?: string
  price?: number
  /** "Values (OPEN, WON, LOST)" */
  status?: string
  closeDate?: string
  contacts?: MoskitEntityId[] | null
  companies?: MoskitEntityId[] | null
  stage?: MoskitEntityId | null
  [key: string]: unknown
}

const STATUS: Record<string, string> = { OPEN: 'open', WON: 'won', LOST: 'lost' }

export function transformDeal(raw: RawMoskitDeal): Deal {
  return {
    id: String(raw.id),
    title: raw.name ?? '',
    status: raw.status ? (STATUS[raw.status] ?? raw.status) : undefined,
    stage_id: refId(raw.stage),
    contact_ids: refIds(raw.contacts),
    // "companies: Empresas relacionadas" — only an unambiguous single one is the deal's company.
    company_id: soleRefId(raw.companies),
    owner_id: refId(raw.responsible),
    close_date: toIsoDatetime(raw.closeDate),
    created_at: toIsoDatetime(raw.dateCreated),
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.price = data.value.amount
  if (data.status !== undefined) out.status = data.status
  if (data.stage_id !== undefined) out.step = { id: data.stage_id }
  if (data.pipeline_id !== undefined) out.funnel = { id: data.pipeline_id }
  if (data.contact_ids?.[0] !== undefined) out.contact = { id: data.contact_ids[0] }
  if (data.company_id !== undefined) out.company = { id: data.company_id }
  if (data.owner_id !== undefined) out.owner = { id: data.owner_id }
  if (data.close_date !== undefined) out.closeDate = data.close_date
  return out
}
