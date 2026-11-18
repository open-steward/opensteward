/**
 * TrueCommerce supplier (trading partner) transform.
 *
 * Maps GET /v1/trading-partners response fields:
 *   partner_id, company_name, contact_email, contact_phone,
 *   default_currency, lead_time_days, status
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, strMap} from './shared'

export interface RawTruecommerceSupplier {
  partner_id: string
  company_name?: string
  contact_email?: string
  contact_phone?: string
  default_currency?: string
  lead_time_days?: number | string
  status?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawTruecommerceSupplier): Supplier {
  return {
    id: raw.partner_id,
    externalId: raw.partner_id,
    name: pickStr(raw.company_name) ?? '',
    email: pickStr(raw.contact_email),
    phone: pickStr(raw.contact_phone),
    defaultCurrency: pickStr(raw.default_currency),
    defaultLeadTimeDays: pickNum(raw.lead_time_days),
    isActive: (raw.status ?? '').toLowerCase() !== 'inactive',
    platform: 'truecommerce',
    metadata: strMap({ status: raw.status }),
    raw,
  }
}
