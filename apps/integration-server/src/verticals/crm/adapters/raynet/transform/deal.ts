import { toIsoDatetime } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'
import { requiredText } from '../required'

/**
 * A deal as GET /businessCase/ ("list of deals") and
 * GET /businessCase/{businessCaseId}/ ("Deal detail") return it. Only fields
 * the documented 200 examples carry.
 */
export interface RawRaynetBusinessCase {
  id: number
  code?: string | null
  name?: string | null
  company?: { id?: number; name?: string } | null
  person?: { id?: number; fullName?: string } | null
  owner?: { id?: number; fullName?: string } | null
  /** "[Currency] Record ID from the Currency picklist". `value` is the picklist label: "CZK", "$". */
  currency?: { id?: number; value?: string } | null
  validFrom?: string | null
  /** Closing date ("Filtering deals by closing date"). */
  validTill?: string | null
  /** Estimated closing date ("Filtering deals by estimated closing date"). */
  scheduledEnd?: string | null
  /** "[Final price] final price of the deal". */
  totalAmount?: number | null
  /** `B_ACTIVE` open, `E_WIN` won, `F_LOST` lost, `G_STORNO` canceled. */
  status?: string | null
  probability?: number | null
  businessCasePhase?: { id?: number; value?: string } | null
  businessCaseType?: { id?: number; value?: string } | null
  'rowInfo.createdAt'?: string | null
  'rowInfo.updatedAt'?: string | null
  [key: string]: unknown
}

/** The `status` filter's documented groups. */
const STATUS: Record<string, string> = {
  B_ACTIVE: 'open',
  E_WIN: 'won',
  F_LOST: 'lost',
  G_STORNO: 'canceled',
}

function idOf(ref: { id?: number } | null | undefined): string | undefined {
  return ref?.id != null ? String(ref.id) : undefined
}

/**
 * The currency is a user-editable picklist whose label need not be an ISO
 * code (the docs' own example has "$"), and no documented field carries the
 * ISO code. The value is kept only when the label already is one.
 */
function valueOf(raw: RawRaynetBusinessCase): Deal['value'] {
  const amount = raw.totalAmount
  const currency = raw.currency?.value
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return undefined
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return undefined
  return { amount, currency }
}

export function transformDeal(raw: RawRaynetBusinessCase): Deal {
  const status = raw.status ?? undefined
  const open = status === 'B_ACTIVE'
  return {
    id: String(raw.id),
    title: requiredText(raw.name, `deal ${raw.id}`),
    value: valueOf(raw),
    status: status !== undefined ? (STATUS[status] ?? status) : undefined,
    stage: raw.businessCasePhase?.value || undefined,
    stage_id: idOf(raw.businessCasePhase),
    pipeline_id: idOf(raw.businessCaseType),
    contact_ids: raw.person?.id != null ? [String(raw.person.id)] : undefined,
    company_id: idOf(raw.company),
    owner_id: idOf(raw.owner),
    // An open deal's close date is its estimate; a closed one's is when it closed.
    close_date: toIsoDatetime(open ? raw.scheduledEnd : raw.validTill),
    probability: typeof raw.probability === 'number' ? raw.probability : undefined,
    created_at: toIsoDatetime(raw['rowInfo.createdAt']),
    updated_at: toIsoDatetime(raw['rowInfo.updatedAt']),
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined)
    out.price = { value: data.value.amount, currency: data.value.currency }
  if (data.status !== undefined) out.status = data.status
  if (data.stage_id !== undefined) out.stage = { id: Number(data.stage_id) }
  if (data.pipeline_id !== undefined) out.pipeline = { id: Number(data.pipeline_id) }
  if (data.company_id !== undefined) out.account = { id: Number(data.company_id) }
  if (data.contact_ids?.[0] !== undefined) out.contact = { id: Number(data.contact_ids[0]) }
  if (data.close_date !== undefined) out.expectedCloseDate = data.close_date
  return out
}
