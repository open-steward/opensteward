/**
 * Fynd application user (storefront customer) ⇄ canonical Customer.
 *
 * Source: `gofynd/fdk-client-javascript` @ commit
 * `7598488bf04e7a75bc44088441745538d524abec`,
 * `sdk/platform/User/UserPlatformApplicationClient.js` — `getCustomers`
 * (`GET user/v1.0/company/{id}/application/{applicationId}/customers/list`,
 * app-scoped); shape from `UserPlatformModel.UserSearchSchema()`.
 *
 * Read-only: `UserPlatformApplicationClient` has no get-by-id, create,
 * update, or delete for an individual customer — end users self-register on
 * the storefront, they are not provisioned through this API (see
 * `metadata.ts`).
 */
import type { Customer } from '../../../schema/customer'

export interface RawFyndCustomer {
  _id: string
  first_name?: string
  last_name?: string
  emails?: Array<{ email?: string; primary?: boolean }>
  phone_numbers?: Array<{ phone?: string; country_code?: number; primary?: boolean }>
  created_at?: string
  updated_at?: string
}

function primaryOrFirst<T extends { primary?: boolean }>(items: T[] | undefined): T | undefined {
  if (!items || items.length === 0) return undefined
  return items.find((i) => i.primary) ?? items[0]
}

function toIso(value: string | undefined): string | undefined {
  if (!value) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

export function transformCustomer(raw: RawFyndCustomer): Customer {
  if (!raw._id) throw new Error('Fynd customer is missing _id')
  const email = primaryOrFirst(raw.emails)?.email
  const phoneEntry = primaryOrFirst(raw.phone_numbers)
  const phone = phoneEntry?.phone
    ? phoneEntry.country_code
      ? `+${phoneEntry.country_code}${phoneEntry.phone}`
      : phoneEntry.phone
    : undefined
  return {
    id: raw._id,
    email: email || undefined,
    firstName: raw.first_name || undefined,
    lastName: raw.last_name || undefined,
    phone,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
