import type { Deal } from '../../../schema/deal'

export interface RawNutshellDeal {
  id: number | string
  name?: string
  /** value: { amount: "1000", currency: "USD" } */
  value?: { amount?: string | number; currency?: string } | null
  status?: number | string
  /** milestone maps to pipeline stage */
  milestone?: { id: number | string; name?: string } | null
  contacts?: Array<{ id: number | string; entityType?: string; stub?: boolean }>
  accounts?: Array<{ id: number | string; entityType?: string; stub?: boolean }>
  assignee?: { id: number | string } | null
  dueTime?: string
  createdTime?: string
  modifiedTime?: string
  [key: string]: unknown
}

function statusLabel(status?: number | string): string | undefined {
  if (status === undefined || status === null) return undefined
  // Nutshell status codes: 0 = active, 1 = won, 2 = lost, 3 = cancelled
  const map: Record<string, string> = {
    '0': 'open',
    '1': 'won',
    '2': 'lost',
    '3': 'cancelled',
  }
  return map[String(status)] ?? String(status)
}

export function transformDeal(raw: RawNutshellDeal): Deal {
  const amount = raw.value?.amount != null ? Number(raw.value.amount) : undefined

  return {
    id: String(raw.id),
    title: raw.name ?? '',
    value: amount != null
      ? { amount, currency: raw.value?.currency ?? 'USD' }
      : undefined,
    status: statusLabel(raw.status),
    stage: raw.milestone?.name,
    stage_id: raw.milestone?.id != null ? String(raw.milestone.id) : undefined,
    contact_ids: raw.contacts?.map((c) => String(c.id)) ?? undefined,
    company_id: raw.accounts?.[0]?.id != null ? String(raw.accounts[0].id) : undefined,
    owner_id: raw.assignee?.id != null ? String(raw.assignee.id) : undefined,
    close_date: raw.dueTime,
    created_at: raw.createdTime,
    updated_at: raw.modifiedTime,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) {
    out.value = {
      amount: String(data.value.amount),
      currency: data.value.currency ?? 'USD',
    }
  }
  if (data.stage_id !== undefined) {
    out.milestone = { id: Number(data.stage_id), entityType: 'Milestones' }
  }
  if (data.contact_ids !== undefined && data.contact_ids.length > 0) {
    out.contacts = data.contact_ids.map((id) => ({ id: Number(id), entityType: 'Contacts' }))
  }
  if (data.company_id !== undefined) {
    out.accounts = [{ id: Number(data.company_id), entityType: 'Accounts' }]
  }
  if (data.owner_id !== undefined) {
    out.assignee = { id: Number(data.owner_id), entityType: 'Users' }
  }
  if (data.close_date !== undefined) out.dueTime = data.close_date
  return out
}
