import type { Deal } from '../../../schema/deal'

// Dolibarr deals/opportunities: GET /proposals (commercial proposals)
// or /opportunities if the CRM module is enabled
export interface RawDolibarrDeal {
  id?: string | number
  ref?: string
  title?: string
  statut?: number  // 0=draft, 1=validated, 2=signed, 3=refused, 4=billed
  total_ttc?: number
  multicurrency_code?: string
  socid?: string | number
  contactid?: string | number
  date_cloture?: string | number
  date_creation?: string | number
  date_modification?: string | number
  [key: string]: unknown
}

const STATUS_MAP: Record<number, string> = {
  0: 'draft',
  1: 'open',
  2: 'won',
  3: 'lost',
  4: 'closed',
}

export function transformDeal(raw: RawDolibarrDeal): Deal {
  const status = raw.statut != null ? (STATUS_MAP[Number(raw.statut)] ?? String(raw.statut)) : undefined
  return {
    id: String(raw.id ?? ''),
    title: raw.title ?? raw.ref ?? '',
    status,
    value: raw.total_ttc != null ? { amount: Number(raw.total_ttc), currency: raw.multicurrency_code ?? 'EUR' } : undefined,
    company_id: raw.socid != null ? String(raw.socid) : undefined,
    contact_ids: raw.contactid != null ? [String(raw.contactid)] : undefined,
    close_date: raw.date_cloture
      ? new Date(Number(raw.date_cloture) * 1000).toISOString()
      : undefined,
    created_at: raw.date_creation
      ? new Date(Number(raw.date_creation) * 1000).toISOString()
      : undefined,
    updated_at: raw.date_modification
      ? new Date(Number(raw.date_modification) * 1000).toISOString()
      : undefined,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out['title'] = data.title
  if (data.value?.amount !== undefined) out['total_ttc'] = data.value.amount
  if (data.company_id !== undefined) out['socid'] = data.company_id
  if (data.contact_ids?.[0] !== undefined) out['contactid'] = data.contact_ids[0]
  return out
}
