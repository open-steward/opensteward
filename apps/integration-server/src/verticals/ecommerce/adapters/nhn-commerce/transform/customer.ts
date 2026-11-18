/**
 * NHN Commerce (Shopby) Profile / Member → canonical Customer.
 *
 * Member profile is returned by GET /profile (requires accessToken).
 * The response includes address fields, marketing opt-ins, and login stats.
 *
 * Note: Shopby does not expose a paginated member list via the shop (public)
 * API — only the currently authenticated member's own profile is available.
 * The adapter therefore only implements getCustomer (via /profile).
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw NHN Commerce shapes ───────────────────────────────────────────────────

export interface RawNhnProfile {
  memberNo?: number | string
  memberId?: string | null
  memberName?: string | null
  firstName?: string | null
  lastName?: string | null
  mobileNo?: string | null
  telephoneNo?: string | null
  email?: string | null
  smsAgreed?: boolean
  directMailAgreed?: boolean
  address?: string | null
  detailAddress?: string | null
  zipCd?: string | null
  countryCd?: string | null
  state?: string | null
  city?: string | null
  joinYmdt?: string | null
  lastLoginYmdt?: string | null
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

function buildAddress(raw: RawNhnProfile): Address | undefined {
  const line1 = raw.address ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.zipCd ?? undefined
  const country = raw.countryCd ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.detailAddress ?? undefined,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country,
  }
}

export function transformProfile(raw: RawNhnProfile): Customer {
  const addr = buildAddress(raw)
  return {
    id: raw.memberNo != null ? String(raw.memberNo) : (raw.memberId ?? ''),
    email: raw.email ?? undefined,
    firstName: raw.memberName ?? raw.firstName ?? undefined,
    lastName: raw.lastName ?? undefined,
    phone: raw.mobileNo ?? raw.telephoneNo ?? undefined,
    acceptsMarketing: raw.smsAgreed ?? raw.directMailAgreed ?? undefined,
    defaultAddress: addr,
    addresses: addr ? [addr] : undefined,
    createdAt: toIsoDatetime(raw.joinYmdt),
    updatedAt: toIsoDatetime(raw.lastLoginYmdt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
