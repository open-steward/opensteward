import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, strMap} from './shared'

export interface RawCin7CoreSupplier {
  ID: string
  Name?: string
  Email?: string
  Phone?: string
  Currency?: string
  LeadTimeDays?: number
  Status?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawCin7CoreSupplier): Supplier {
  return {
    id: raw.ID,
    externalId: raw.ID,
    name: pickStr(raw.Name) ?? '',
    email: pickStr(raw.Email),
    phone: pickStr(raw.Phone),
    defaultCurrency: pickStr(raw.Currency),
    defaultLeadTimeDays: pickNum(raw.LeadTimeDays),
    isActive: (raw.Status ?? '').toLowerCase() !== 'inactive',
    platform: 'cin7-core',
    metadata: strMap({ status: raw.Status }),
    raw,
  }
}
