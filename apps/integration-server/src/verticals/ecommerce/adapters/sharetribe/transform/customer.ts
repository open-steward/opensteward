/**
 * Sharetribe user → canonical Customer.
 *
 * The Sharetribe Integration API exposes users with nested profile attributes
 * (firstName, lastName, displayName, bio) and top-level state/email fields.
 *
 * Key field notes:
 *  - `id` is a UUID object { uuid: string }.
 *  - `profile` nests personal info fields.
 *  - `state` is one of: "active", "banned", "pendingApproval", "deleted".
 *  - Addresses and phone numbers are not part of the core user schema; they
 *    live in protectedData / publicData.
 *
 * Docs: https://www.sharetribe.com/api-reference/integration.html#users
 */

import type { Customer } from '../../../schema/customer'
import type { SharetribeUUID } from './product'

// ── Raw Sharetribe shapes ─────────────────────────────────────────────────────

export interface RawSharetribeUser {
  id: SharetribeUUID
  type: 'user'
  attributes: {
    email?: string | null
    emailVerified?: boolean
    pendingEmail?: string | null
    state?: string | null
    banned?: boolean
    deleted?: boolean
    createdAt?: string
    profile?: {
      firstName?: string | null
      lastName?: string | null
      displayName?: string | null
      abbreviatedName?: string | null
      bio?: string | null
      publicData?: Record<string, unknown>
      protectedData?: Record<string, unknown>
      privateData?: Record<string, unknown>
      metadata?: Record<string, unknown>
    }
    stripeConnected?: boolean
    identityProviders?: unknown[]
    permissions?: unknown
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformUser(raw: RawSharetribeUser): Customer {
  const id = raw.id?.uuid ?? String(raw.id)
  const attrs = raw.attributes
  const profile = attrs.profile ?? {}

  return {
    id,
    email: attrs.email ?? undefined,
    firstName: profile.firstName ?? undefined,
    lastName: profile.lastName ?? undefined,
    createdAt: attrs.createdAt,
    metadata: {
      state: attrs.state,
      banned: attrs.banned,
      deleted: attrs.deleted,
      emailVerified: attrs.emailVerified,
      pendingEmail: attrs.pendingEmail,
      stripeConnected: attrs.stripeConnected,
      displayName: profile.displayName,
      abbreviatedName: profile.abbreviatedName,
      bio: profile.bio,
      publicData: profile.publicData,
      protectedData: profile.protectedData,
      privateData: profile.privateData,
      profileMetadata: profile.metadata,
    } as Record<string, unknown>,
  }
}

/** Canonical Customer → Sharetribe user update_profile body. */
export function untransformUser(customer: Partial<Customer>): Record<string, unknown> {
  const profile: Record<string, unknown> = {}
  if (customer.firstName !== undefined) profile.firstName = customer.firstName
  if (customer.lastName !== undefined) profile.lastName = customer.lastName
  if (customer.firstName && customer.lastName) {
    profile.displayName = `${customer.firstName} ${customer.lastName}`
  }
  return { profile }
}
