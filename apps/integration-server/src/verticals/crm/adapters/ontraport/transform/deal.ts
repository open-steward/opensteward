import type { Deal } from '../../../schema/deal'

// Ontraport does not have a native deals/opportunities object
// listDeals returns []

export interface RawOntraportDeal {
  id?: string | number
  name?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawOntraportDeal): Deal {
  return {
    id: String(raw['id'] ?? ''),
    title: String(raw['name'] ?? ''),
    metadata: raw,
  }
}
