/**
 * Kladana counterparty/supplier transform.
 *
 * Source: /entity/counterparty
 * Key fields:
 *   id          — UUID
 *   name        — counterparty name
 *   email       — contact email
 *   phone       — contact phone
 *   archived    — true = inactive
 *   companyType — "legal" | "entrepreneur" | "individual"
 *   created     — creation timestamp
 *   updated     — last modification timestamp
 *
 * Note: Kladana does not expose a native defaultCurrency field on counterparties —
 * that is stored on their pricelist agreements. We omit it rather than guess.
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

export interface RawKladanaSupplier {
  id: string
  name?: string
  email?: string
  phone?: string
  archived?: boolean
  companyType?: string
  externalCode?: string
  created?: string
  updated?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawKladanaSupplier): Supplier {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    email: pickStr(raw.email),
    phone: pickStr(raw.phone),
    isActive: !(raw.archived ?? false),
    platform: 'kladana',
    metadata: strMap({ companyType: raw.companyType, externalCode: raw.externalCode }),
    raw,
  }
}
