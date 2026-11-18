/**
 * Mercado Libre Customer Data Access → canonical Customer.
 *
 * Mercado Libre exposes buyer data through the Customer Data Access (CDA) API,
 * available only to Mercado Shops sellers who have completed ML's certification:
 *   GET /shops/cda/customers                   → paginated list (scroll_id-based)
 *   GET /shops/cda/customers?buyer_id={id}     → filter by buyer id
 *
 * Response structure:
 *   {
 *     results: [{
 *       id: string,
 *       date_created: string,
 *       paid_amount: number,
 *       currency_id: string,
 *       buyer: {
 *         id: number,
 *         person: { first_name: string, last_name: string, birthdate?: string, gender?: string },
 *         contact: { email: string, phone?: string }
 *       }
 *     }],
 *     scroll_id: string,
 *     paging: { total: number, offset: number, limit: number }
 *   }
 *
 * Canonical `Customer.id` = ML buyer id (from buyer.id field).
 */

import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawMeliBuyerPerson {
  first_name?: string
  last_name?: string
  birthdate?: string | null
  gender?: string | null
}

export interface RawMeliBuyerContact {
  email?: string
  phone?: string | null
}

export interface RawMeliBuyerDetail {
  id: number
  person?: RawMeliBuyerPerson
  contact?: RawMeliBuyerContact
}

export interface RawMeliCdaCustomer {
  id: string
  date_created?: string
  paid_amount?: number
  currency_id?: string
  buyer?: RawMeliBuyerDetail
  [key: string]: unknown
}

export interface RawMeliCdaEnvelope {
  results?: RawMeliCdaCustomer[]
  scroll_id?: string
  paging?: {
    total?: number
    offset?: number
    limit?: number
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformCustomer(raw: RawMeliCdaCustomer): Customer {
  const buyer = raw.buyer
  const person = buyer?.person
  const contact = buyer?.contact

  const totalSpent =
    raw.paid_amount != null && raw.currency_id
      ? {
          amount: majorToMinor(raw.paid_amount, raw.currency_id),
          currency: raw.currency_id,
        }
      : undefined

  return {
    id: buyer ? String(buyer.id) : raw.id,
    email: contact?.email ?? undefined,
    firstName: person?.first_name ?? undefined,
    lastName: person?.last_name ?? undefined,
    phone: contact?.phone ?? undefined,
    acceptsMarketing: undefined,
    ordersCount: undefined,
    totalSpent,
    tags: undefined,
    defaultAddress: undefined,
    addresses: undefined,
    createdAt: toIsoDatetime(raw.date_created),
    updatedAt: undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
