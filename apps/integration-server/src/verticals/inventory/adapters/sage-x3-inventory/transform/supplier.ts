/**
 * Transform Sage X3 BPSUPPLIER representation to canonical Supplier.
 *
 * BPSUPPLIER is the supplier (business partner) master table.
 *
 * Key fields:
 *   BPSNUM  — supplier code (primary key)
 *   BPSNAM  — company name
 *   BPSSHO  — short description
 *   CUR     — default transaction currency
 *   PTE     — payment term code
 *   ENAFLG  — active flag (2=active, 1=inactive)
 *   BPSTYP  — supplier type
 *   BSGCOD  — supplier group / category
 *   CREDAT  — creation date
 *   UPDDAT  — last update date
 *
 * Note: Email and phone live in the related address/contact tables (BPADDRESS,
 * CONTACT) and may not be present in the base BPSUPPLIER representation.
 * We include them if the representation happens to inline them.
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, strMap} from './shared'

export interface RawSageX3Supplier {
  /** Supplier code — primary key */
  BPSNUM?: string
  /** Company / supplier name */
  BPSNAM?: string
  /** Short name */
  BPSSHO?: string
  /** Default transaction currency */
  CUR?: string
  /** Payment term */
  PTE?: string
  /** Enabled flag: '2'=active, '1'=inactive */
  ENAFLG?: string | number
  /** Supplier type */
  BPSTYP?: string
  /** Supplier category / group */
  BSGCOD?: string
  /** Default lead time in days (from purchase parameters) */
  PUTTIM?: number | string
  /** Email — may be present if address is inlined */
  WEB?: string
  /** Phone — may be present if address is inlined */
  TEL?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawSageX3Supplier): Supplier {
  const id = pickStr(raw.BPSNUM) ?? ''

  // ENAFLG: 2 = enabled/active in Sage X3
  const isActive = String(raw.ENAFLG ?? '2') === '2'

  return {
    id,
    externalId: id,
    name: pickStr(raw.BPSNAM) ?? pickStr(raw.BPSSHO) ?? id,
    email: pickStr(raw.WEB),
    phone: pickStr(raw.TEL),
    defaultCurrency: pickStr(raw.CUR),
    defaultLeadTimeDays: pickNum(raw.PUTTIM),
    isActive,
    platform: 'sage-x3-inventory',
    metadata: strMap({
      bpstyp: raw.BPSTYP,
      bsgcod: raw.BSGCOD,
      pte: raw.PTE,
      enaflg: raw.ENAFLG,
    }),
    raw,
  }
}
