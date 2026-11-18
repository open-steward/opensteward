import type { Deal } from '../../../schema/deal'

// Sansan does not have a deal pipeline API.
// This transform is a placeholder; listDeals returns [].
export interface RawSansanDeal {
  id?: string
  name?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawSansanDeal): Deal {
  return {
    id: String(raw.id ?? ''),
    title: raw.name ?? '',
    contact_ids: [],
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  return out
}
