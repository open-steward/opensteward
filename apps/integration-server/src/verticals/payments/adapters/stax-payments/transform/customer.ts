import { toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'
import { optStr, requiredId } from './shared'

/**
 * A Stax customer, as GET /customer (find-all-customers) lists it and
 * GET /customer/{id} returns it. Fields from the documented response example:
 * id, firstname, lastname, company, email, phone, reference, options,
 * created_at, updated_at, deleted_at, gravatar.
 * https://docs.staxpayments.com/reference/find-all-customers
 */
export interface RawStaxCustomer {
  id?: string
  firstname?: string | null
  lastname?: string | null
  company?: string | null
  email?: string | null
  phone?: string | null
  reference?: string | null
  created_at?: string | null
  updated_at?: string | null
  [k: string]: unknown
}

export function transformCustomer(raw: RawStaxCustomer): Customer {
  const id = requiredId(raw.id, 'customer')
  const name = [optStr(raw.firstname), optStr(raw.lastname)].filter(Boolean).join(' ')
  return {
    id,
    externalId: id,
    email: optStr(raw.email),
    name: name === '' ? undefined : name,
    phone: optStr(raw.phone),
    gateway: 'stax-payments',
    metadata: {},
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
