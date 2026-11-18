/**
 * Maps Optimizely Configured Commerce's `AccountModel` (Storefront API v1,
 * `GET /api/v1/accounts/{id}` and `PATCH /api/v1/accounts/{id}` — both
 * confirmed to return the account bare, not wrapped) to/from the canonical
 * Customer shape. Field names per the published reference:
 * https://docs.developers.optimizely.com/configured-commerce/reference/accountsv1_getcollectionasync
 * https://docs.developers.optimizely.com/configured-commerce/reference/accountsv1_patchasync
 *
 * The Account response can carry `password` and `accessToken` fields — both
 * are stripped before the raw record is placed in `metadata` so a secret
 * never ends up in a persisted/logged field.
 *
 * No `createCustomer` here: `POST /api/v1/accounts` requires a `password`
 * the canonical `Customer` shape has no field for, and the account also
 * needs a `userName`. Synthesizing either would mean writing a record this
 * adapter invented rather than one the caller actually supplied, so account
 * creation is left unimplemented (see `../metadata.ts`) — `updateCustomer`
 * only touches fields the docs confirm are independently writable
 * (email/firstName/lastName), none of which need to be invented.
 */
import type { Customer } from '../../../schema/customer'

export interface RawOptimizelyAccount {
  id: string
  email?: string | null
  firstName?: string | null
  lastName?: string | null
  password?: string | null
  accessToken?: string | null
  [key: string]: unknown
}

function sanitizeMetadata(raw: RawOptimizelyAccount): Record<string, unknown> {
  const { password: _password, accessToken: _accessToken, ...rest } = raw
  return rest
}

export function transformCustomer(raw: RawOptimizelyAccount): Customer {
  return {
    id: raw.id,
    email: raw.email?.trim() || undefined,
    firstName: raw.firstName ?? undefined,
    lastName: raw.lastName ?? undefined,
    metadata: sanitizeMetadata(raw),
  }
}

/** `PATCH /api/v1/accounts/{id}` writable fields used here — confirmed by the reference. */
export function untransformCustomer(data: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (data.email !== undefined) body['email'] = data.email
  if (data.firstName !== undefined) body['firstName'] = data.firstName
  if (data.lastName !== undefined) body['lastName'] = data.lastName
  return body
}
