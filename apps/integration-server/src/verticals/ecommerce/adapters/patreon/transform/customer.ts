/**
 * Patreon Member → canonical Customer.
 *
 * Patreon members are patrons who have pledged to a campaign.
 * The member resource includes the user relationship for personal details.
 *
 * Mapping:
 *  - Member.id → Customer.id
 *  - Member.email → Customer.email
 *  - Member.full_name → Customer.firstName (full name in one field)
 *  - Member.patron_status → metadata.patronStatus
 *  - Member.lifetime_support_cents → Customer.totalSpent
 *  - User (from included) → additional personal fields
 *
 * Patreon member is patron-level — not a company like OroCommerce.
 */

import type { Customer } from '../../../schema/customer'
import type { FlatResource } from '../client'

export interface RawPatreonMember {
  id: string
  email?: string
  full_name?: string
  is_follower?: boolean
  last_charge_date?: string | null
  last_charge_status?: string | null
  lifetime_support_cents?: number
  currently_entitled_amount_cents?: number
  note?: string
  patron_status?: string | null // active_patron | declined_patron | former_patron | null
  pledge_cadence?: number | null
  pledge_relationship_start?: string | null
  will_pay_amount_cents?: number
  _type?: string
  _relationships?: Record<string, unknown>
  _included?: FlatResource[]
  [key: string]: unknown
}

export interface RawPatreonUser {
  id: string
  email?: string
  first_name?: string
  last_name?: string
  full_name?: string
  image_url?: string
  thumb_url?: string
  url?: string
  vanity?: string | null
  created?: string
  _type?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractUser(raw: RawPatreonMember): RawPatreonUser | undefined {
  const included = raw._included ?? []
  // Find the user related to this member via relationships
  const rels = raw._relationships as Record<string, { data?: { type: string; id: string } }> | undefined
  const userId = rels?.['user']?.data?.id
  if (userId) {
    return included.find((r) => r._type === 'user' && r.id === userId) as unknown as RawPatreonUser | undefined
  }
  return included.find((r) => r._type === 'user') as unknown as RawPatreonUser | undefined
}

function splitName(fullName: string | undefined): { firstName?: string; lastName?: string } {
  if (!fullName) return {}
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0] }
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformCustomer(raw: RawPatreonMember): Customer {
  const user = extractUser(raw)
  const email = raw.email ?? user?.email
  const { firstName, lastName } = user
    ? { firstName: user.first_name, lastName: user.last_name }
    : splitName(raw.full_name)

  return {
    id: raw.id,
    email,
    firstName,
    lastName,
    totalSpent:
      raw.lifetime_support_cents != null
        ? { amount: raw.lifetime_support_cents / 100, currency: 'USD' }
        : undefined,
    createdAt: raw.pledge_relationship_start ?? user?.created,
    metadata: {
      ...(raw as Record<string, unknown>),
      patronStatus: raw.patron_status,
      isFollower: raw.is_follower,
      lastChargeDate: raw.last_charge_date,
      lastChargeStatus: raw.last_charge_status,
      currentlyEntitledAmountCents: raw.currently_entitled_amount_cents,
      pledgeCadence: raw.pledge_cadence,
      userId: user?.id,
      userUrl: user?.url,
      userImageUrl: user?.image_url,
    },
  }
}

export function untransformCustomer(
  customer: Partial<Customer>,
): Record<string, unknown> {
  return {
    data: {
      type: 'member',
      attributes: {
        email: customer.email,
        full_name: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || undefined,
      },
    },
  }
}
