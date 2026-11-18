import type { Deal } from '../../../schema/deal'

// Mautic does not have a native deals resource
// This module is a stub — listDeals returns []

export interface RawMauticDeal {
  id?: string | number
  [key: string]: unknown
}

export function transformDeal(raw: RawMauticDeal): Deal {
  return {
    id: String(raw.id ?? ''),
    title: '',
    metadata: raw,
  }
}
