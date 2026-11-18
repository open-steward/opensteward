/**
 * Transform an HD Customer (Frappe Helpdesk) into the canonical Contact schema.
 *
 * Frappe Helpdesk uses HD Customer as the contact/account entity.
 * Individual email contacts may also appear as standard Frappe Contact records
 * linked through raised_by on HD Ticket.
 *
 * Key HD Customer fields:
 *   name           — document ID (auto-named, usually same as customer_name)
 *   customer_name  — display name
 *   domain         — company domain
 *   image          — avatar URL
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawFrappeCustomer {
  name: string
  customer_name?: string
  domain?: string | null
  image?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawFrappeCustomer): Contact {
  return {
    id: raw.name,
    externalId: raw.name,
    name: pickStr(raw.customer_name) ?? raw.name,
    // HD Customer tracks company/domain rather than individual email
    email: undefined,
    phone: undefined,
    organizationId: undefined,
    platform: 'frappe-helpdesk',
    metadata: strMap({ domain: raw.domain }),
    raw,
  }
}
