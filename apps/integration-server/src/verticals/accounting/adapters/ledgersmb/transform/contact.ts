/**
 * LedgerSMB contact transform.
 *
 * LedgerSMB's v0 REST API does not yet expose a standalone contacts/entities
 * list endpoint. Contact information is embedded within invoice and order
 * responses as the `eca` (Entity Credit Account) object.
 *
 * ECA fields:
 *   id          — internal integer id
 *   number      — customer/vendor number shown in the UI
 *   type        — 'customer' | 'vendor'
 *   description — contact name / trade name
 *   pay_to_name — payee name override (for vendors)
 *   entity      — { name, control_code }
 *   credit_limit — { total, used, available }
 *
 * We surface ECA objects encountered in invoice/order payloads as Contact
 * records. Full contact CRUD (including address, email, phone) is not
 * available in the LedgerSMB v0 REST API.
 */

import type { Contact } from '../../../schema/contact'

export interface LedgerSMBECA {
  id?: number | string
  number?: string
  type?: 'customer' | 'vendor'
  description?: string
  pay_to_name?: string
  entity?: {
    name?: string
    control_code?: string
  }
  credit_limit?: {
    total?: number
    used?: number
    available?: number
  }
  [key: string]: unknown
}

export function transformContact(raw: LedgerSMBECA): Contact {
  const isCustomer = raw.type === 'customer'
  const isSupplier = raw.type === 'vendor'

  // Prefer entity name for display, fall back to description (trade name)
  const name = raw.entity?.name || raw.description || undefined

  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name,
    companyName: raw.description || undefined,
    identification: raw.number || raw.entity?.control_code || undefined,
    isCustomer,
    isSupplier,
    metadata: raw as Record<string, unknown>,
  }
}
