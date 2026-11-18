/**
 * Transform a Datapel Breeze `contacts` record (supplier/vendor type) into
 * the canonical Supplier shape.
 *
 * Datapel uses a single Contact model for both customers and suppliers,
 * distinguished by `contacttype`. The adapter filters to supplier-type
 * contacts at the list level in index.ts.
 *
 * Field mapping based on the ccBreezeSDK Contact domain model:
 *   contactid           — numeric PK
 *   firstname + lastname — display name (or companyid for companies)
 *   currencycode        — default currency
 *   isinactive          — inverse active flag
 *   contacttype         — 'Supplier', 'Customer', etc.
 *   createdat / updatedat
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

export interface RawDatapelContact {
  contactid?: number | string
  firstname?: string
  lastname?: string
  isindividual?: boolean | string | number
  isinactive?: boolean | string | number
  currencycode?: string
  contacttype?: string
  cardidentification?: string
  companyid?: string
  identifiers?: string
  createdat?: string | number
  updatedat?: string | number
  customfield1?: string
  customfield2?: string
  customfield3?: string
  [key: string]: unknown
}

function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v
  if (v === 1 || v === '1' || v === 'true' || v === 'Y') return true
  return false
}

function buildName(raw: RawDatapelContact): string {
  const first = pickStr(raw.firstname) ?? ''
  const last = pickStr(raw.lastname) ?? ''
  const combined = [first, last].filter(Boolean).join(' ')
  return combined || pickStr(raw.companyid) || pickStr(raw.cardidentification) || ''
}

export function transformSupplier(raw: RawDatapelContact): Supplier {
  const id = String(raw.contactid ?? '')
  return {
    id,
    externalId: id,
    name: buildName(raw),
    defaultCurrency: pickStr(raw.currencycode),
    isActive: !toBool(raw.isinactive),
    platform: 'datapel',
    metadata: strMap({
      contacttype: raw.contacttype,
      cardidentification: raw.cardidentification,
      companyid: raw.companyid,
      identifiers: raw.identifiers,
      customfield1: raw.customfield1,
      customfield2: raw.customfield2,
      customfield3: raw.customfield3,
    }),
    raw,
  }
}
