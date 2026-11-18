/**
 * Tmall / TOP buyer info → canonical Customer.
 *
 * The TOP API does not expose a dedicated customer/buyer API. Buyer
 * information is embedded in trade (order) responses. This module
 * projects the buyer fields from a trade response into a canonical
 * Customer shape.
 *
 * Important: Chinese marketplaces typically do not expose buyer email
 * addresses to sellers. The `email` field will usually be absent.
 * The `buyer_nick` (Taobao username) serves as the unique buyer identifier.
 *
 * The canonical `id` is the `buyer_nick` — it is stable per buyer account.
 */

import type { Customer } from '../../../schema/customer'

// ── Raw shapes ────────────────────────────────────────────────────────────────

/**
 * Buyer fields extracted from a TOP trade response.
 * This is a subset of RawTmallTrade focused on buyer identity.
 */
export interface RawTmallBuyer {
  buyer_nick?: string
  buyer_email?: string
  buyer_alipay_no?: string
  receiver_name?: string
  receiver_phone?: string
  receiver_mobile?: string
  receiver_state?: string
  receiver_city?: string
  receiver_district?: string
  receiver_address?: string
  receiver_zip?: string
  buyer_rate?: boolean
  credit_score?: number
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Split a Chinese full name into first + last.
 *
 * Chinese convention is surname-first (e.g. "张伟" → last: "张", first: "伟").
 * For names that look Western (contain spaces), we split on the first space
 * and treat the leading part as first name.
 *
 * If the name is a single token without spaces, the whole name goes into
 * `firstName` and `lastName` is left undefined to avoid guessing.
 */
export function splitReceiverName(
  name: string | undefined,
): { firstName: string | undefined; lastName: string | undefined } {
  if (!name) return { firstName: undefined, lastName: undefined }
  const trimmed = name.trim()
  if (!trimmed) return { firstName: undefined, lastName: undefined }

  const spaceIdx = trimmed.indexOf(' ')
  if (spaceIdx > 0) {
    return {
      firstName: trimmed.substring(0, spaceIdx),
      lastName: trimmed.substring(spaceIdx + 1),
    }
  }

  // Single token — could be a Chinese name like "张伟"
  if (trimmed.length >= 2) {
    return {
      firstName: trimmed.substring(1),
      lastName: trimmed.substring(0, 1),
    }
  }

  return { firstName: trimmed, lastName: undefined }
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * TOP buyer fields → canonical Customer.
 *
 * `buyer_nick` is the stable Taobao username and serves as the canonical `id`.
 * The complete raw buyer object is stored in `metadata`.
 */
export function transformCustomer(raw: RawTmallBuyer): Customer {
  const { firstName, lastName } = splitReceiverName(raw.receiver_name)

  const defaultAddress =
    raw.receiver_address || raw.receiver_city
      ? {
          line1: raw.receiver_address ?? undefined,
          city: raw.receiver_city ?? undefined,
          region: raw.receiver_state ?? undefined,
          postalCode: raw.receiver_zip ?? undefined,
          country: 'CN',
        }
      : undefined

  return {
    id: raw.buyer_nick ?? raw.buyer_alipay_no ?? '',
    email: raw.buyer_email ?? undefined,
    firstName,
    lastName,
    phone: raw.receiver_mobile ?? raw.receiver_phone ?? undefined,
    defaultAddress,
    addresses: defaultAddress ? [defaultAddress] : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Extract a unique buyer from a list of trade objects and deduplicate by
 * `buyer_nick`. Useful when building a customer list from trade history.
 */
export function extractUniqueCustomers(trades: RawTmallBuyer[]): Customer[] {
  const seen = new Set<string>()
  const result: Customer[] = []
  for (const trade of trades) {
    const nick = trade.buyer_nick ?? trade.buyer_alipay_no ?? ''
    if (nick && !seen.has(nick)) {
      seen.add(nick)
      result.push(transformCustomer(trade))
    }
  }
  return result
}
