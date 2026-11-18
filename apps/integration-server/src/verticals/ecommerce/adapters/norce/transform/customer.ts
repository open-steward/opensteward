/**
 * Maps Norce Commerce Query's `Customer` entity (Customers/Customers) to the
 * canonical Customer shape. Field names verbatim from the published OpenAPI
 * schema for `Enferno.Storm.Query.Api.DataContexts.CustomerModel.Customer`:
 * https://docs.norce.io/api-reference/query/querycustomers/openapi
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'

export interface RawNorceCustomer {
  Id: number
  EmailAddress?: string | null
  FirstName?: string | null
  LastName?: string | null
  PhoneNumber?: string | null
  CellPhoneNumber?: string | null
  IsActive?: boolean | null
  Created?: string | number | null
  Updated?: string | number | null
  [key: string]: unknown
}

export function transformCustomer(raw: RawNorceCustomer): Customer {
  const email = raw.EmailAddress?.trim()
  return {
    id: String(raw.Id),
    email: email ? email : undefined,
    firstName: raw.FirstName ?? undefined,
    lastName: raw.LastName ?? undefined,
    phone: raw.PhoneNumber ?? raw.CellPhoneNumber ?? undefined,
    createdAt: toIsoDatetime(raw.Created),
    updatedAt: toIsoDatetime(raw.Updated),
    metadata: raw as Record<string, unknown>,
  }
}
