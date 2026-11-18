/**
 * Temu Buyer → canonical Customer.
 *
 * Temu does not expose a first-class customer/buyer management API for
 * sellers — buyer data is embedded within order responses. This transform
 * reconstructs a canonical Customer from what is available in the order's
 * buyer fields.
 *
 * Docs: https://partner.temu.com/documentation
 */

import type { Customer } from '../../../schema/customer'

// ── Raw Temu shapes ───────────────────────────────────────────────────────────

/**
 * Buyer data as embedded in a Temu order (`bg.order.list.v2.get`).
 * There is no standalone buyer-list endpoint.
 */
export interface RawTemuBuyer {
  buyer_id: string | number
  buyer_email?: string | null
  buyer_phone?: string | null
  /** Display name (may be a username, not necessarily a real name). */
  buyer_name?: string | null
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCustomer(raw: RawTemuBuyer): Customer {
  return {
    id: String(raw.buyer_id),
    email: raw.buyer_email ?? undefined,
    phone: raw.buyer_phone ?? undefined,
    firstName: raw.buyer_name ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
