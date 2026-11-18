/**
 * Pepperi Account → canonical Customer.
 *
 * Field names below (`InternalID`, `ExternalID`, `Name`, `Email`, `Phone`,
 * `CreationDate`, `Hidden`) are confirmed against Pepperi's OWN bundled
 * request-body definitions for `POST /accounts`, served from
 * https://storage.pepperi.com/Developer/developer_body.js. Note the field is
 * `CreationDate`, not `CreationDateTime` — Accounts and Items use different
 * naming than Transactions (`CreationDateTime`/`ModificationDateTime`), and
 * no modification-date field is present for Accounts at all, so this
 * transform does not set `updatedAt`.
 *
 * `ExternalID` is the single documented identifier this adapter uses for
 * `id` — never chained with `InternalID`. It is REQUIRED on the canonical
 * `Customer`, so a raw record missing it is not translatable and
 * `transformCustomer` throws rather than inventing a value.
 *
 * Pepperi Accounts are B2B buying businesses, not individual people; the
 * canonical `Customer` schema has no dedicated company-name field, so the
 * confirmed `Name` field is surfaced via `lastName` (an explicit adapter
 * mapping decision, not a platform fact) and `firstName` is left unset.
 */
import type { Customer } from '../../../schema/customer'

export interface RawPepperiAccount {
  InternalID: number
  ExternalID?: string | null
  Name?: string | null
  Email?: string | null
  Phone?: string | null
  CreationDate?: string | null
  Hidden?: boolean
  [key: string]: unknown
}

export function transformCustomer(raw: RawPepperiAccount): Customer {
  if (!raw.ExternalID) {
    throw new Error(
      `Pepperi account ${raw.InternalID} has no ExternalID — cannot map to a canonical Customer id.`,
    )
  }
  return {
    id: raw.ExternalID,
    email: raw.Email ?? undefined,
    lastName: raw.Name ?? undefined,
    phone: raw.Phone ?? undefined,
    createdAt: raw.CreationDate ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/** Reverse mapping for `POST /accounts` upsert — field names as confirmed above. */
export function untransformCustomer(data: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (data.id !== undefined) body.ExternalID = data.id
  if (data.lastName !== undefined) body.Name = data.lastName
  if (data.email !== undefined) body.Email = data.email
  if (data.phone !== undefined) body.Phone = data.phone
  return body
}
