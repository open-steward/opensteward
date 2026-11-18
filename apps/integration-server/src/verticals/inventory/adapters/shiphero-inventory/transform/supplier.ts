import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, strMap} from './shared'

export interface RawShipHeroInventorySupplier {
  ID: string
  Name?: string
  Email?: string
  Phone?: string
  Currency?: string
  LeadTimeDays?: number
  Status?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawShipHeroInventorySupplier): Supplier {
  return {
    id: raw.ID,
    externalId: raw.ID,
    name: pickStr(raw.Name) ?? '',
    email: pickStr(raw.Email),
    phone: pickStr(raw.Phone),
    defaultCurrency: pickStr(raw.Currency),
    defaultLeadTimeDays: pickNum(raw.LeadTimeDays),
    isActive: (raw.Status ?? '').toLowerCase() !== 'inactive',
    platform: 'shiphero-inventory',
    metadata: strMap({ status: raw.Status }),
    raw,
  }
}
