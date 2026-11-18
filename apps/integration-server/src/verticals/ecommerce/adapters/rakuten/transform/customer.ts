/**
 * Rakuten orderer info → canonical Customer.
 *
 * Rakuten Ichiba does not provide a dedicated customer management API.
 * Customer data is embedded in order responses under `ordererInfo`.
 * We derive customer records from order data.
 *
 * Rakuten names are typically provided in kanji + kana pairs:
 *   - `ordererName`     — kanji name (family + given, space-separated)
 *   - `ordererNameKana` — kana reading
 *
 * The canonical Customer id is synthesised from the email address or
 * orderer name since Rakuten does not expose a stable buyer id via the
 * seller API.
 */

import type { Customer } from '../../../schema/customer'
import type { RakutenOrdererInfo } from './order'

// ── Raw shapes ────────────────────────────────────────────────────────────────

/** Extended orderer info as used by this adapter. */
export interface RakutenCustomerSource extends RakutenOrdererInfo {
  /** Synthetic id provided by the adapter (e.g. from order number or email hash) */
  _id?: string
  /** Source order numbers this customer appeared in */
  _orderNumbers?: string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Split a Japanese full name "姓 名" into [firstName, lastName].
 * Falls back to returning the whole name as firstName if no space is found.
 */
export function splitName(
  fullName: string | undefined,
): { firstName?: string; lastName?: string } {
  if (!fullName) return {}
  const trimmed = fullName.trim()
  const spaceIndex = trimmed.indexOf(' ')
  if (spaceIndex === -1) {
    // No separator — return as-is; Japanese convention is family name first
    return { lastName: trimmed }
  }
  return {
    lastName: trimmed.slice(0, spaceIndex),
    firstName: trimmed.slice(spaceIndex + 1),
  }
}

/**
 * Derive a stable customer id from the available data.
 * Priority: explicit _id → email → hashed name
 */
export function deriveCustomerId(raw: RakutenCustomerSource): string {
  if (raw._id) return raw._id
  if (raw.ordererMailAddress) return `email:${raw.ordererMailAddress}`
  if (raw.ordererName) return `name:${raw.ordererName}`
  return 'rakuten-unknown-customer'
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCustomer(raw: RakutenCustomerSource): Customer {
  const { firstName, lastName } = splitName(raw.ordererName)

  const line1 = raw.ordererAddress
  const line2 = raw.ordererAddressB
  const region = raw.ordererPrefecture
  const postalCode = raw.ordererZipCode

  const hasAddress = line1 ?? line2 ?? region ?? postalCode
  const defaultAddress = hasAddress
    ? {
        line1,
        line2,
        region,
        postalCode,
        country: 'JP',
      }
    : undefined

  return {
    id: deriveCustomerId(raw),
    email: raw.ordererMailAddress,
    firstName,
    lastName,
    phone: raw.ordererPhoneNumber1,
    defaultAddress,
    addresses: defaultAddress ? [defaultAddress] : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
