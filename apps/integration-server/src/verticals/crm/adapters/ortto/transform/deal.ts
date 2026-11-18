import type { Deal } from '../../../schema/deal'

// Ortto does not have a native deals/opportunities model — stub only.
export interface RawOrttoDeal {
  id?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawOrttoDeal): Deal {
  return {
    id: String(raw.id ?? ''),
    title: '',
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.title = data.title
  if (data.value?.amount !== undefined) out.value = data.value.amount
  return out
}
