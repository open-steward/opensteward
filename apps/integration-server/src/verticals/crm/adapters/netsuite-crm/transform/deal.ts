import type { Deal } from '../../../schema/deal'

// NetSuite CRM deals (opportunities) — stub, not implemented per spec
export interface RawNetsuiteDeal {
  id: string | number
  [key: string]: unknown
}

export function transformDeal(raw: RawNetsuiteDeal): Deal {
  return {
    id: String(raw.id),
    title: '',
    metadata: raw,
  }
}
