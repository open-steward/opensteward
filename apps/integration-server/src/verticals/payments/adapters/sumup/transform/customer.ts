/**
 * SumUp `Customer` -> canonical Customer.
 *
 * The body of GET /v0.1/customers/{customer_id} (first-party spec,
 * https://raw.githubusercontent.com/sumup/sumup-openapi/refs/heads/main/openapi.json):
 * `customer_id` ("Unique identifier of the customer.", required) and
 * `personal_details` (`PersonalDetails`: first_name, last_name, email, phone, ...).
 */

import type { Customer } from '../../../schema/customer'
import { pickStr } from './shared'

export interface RawSumupCustomer {
  customer_id: string
  personal_details?: {
    first_name?: string
    last_name?: string
    email?: string
    phone?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export function transformCustomer(raw: RawSumupCustomer): Customer {
  if (typeof raw.customer_id !== 'string' || raw.customer_id === '') {
    throw new Error('SumUp customer has no customer_id')
  }
  const details = raw.personal_details ?? {}
  const name = [pickStr(details.first_name), pickStr(details.last_name)].filter(Boolean).join(' ')
  return {
    id: raw.customer_id,
    externalId: raw.customer_id,
    email: pickStr(details.email),
    name: name || undefined,
    phone: pickStr(details.phone),
    gateway: 'sumup',
    metadata: {},
    raw,
  }
}
