/**
 * StoreHippo `ms.users` record → canonical Customer.
 *
 * Fields, from the ms-users reference
 * (https://help.storehippo.com/api/reference/ms-users):
 *   first_name        "First name of the user."
 *   last_name         "Last name of the user."
 *   email             "Email address of the user." (required)
 *   phone             "Contact number of the user."
 *   created_on        "Date and time of addition of the user." (ex 2014-08-26T12:09:05.008Z)
 *   total_order_count number
 * `_id` and `updated_on` are on every record in the documented responses.
 */

import type { Customer } from '../../../schema/customer'
import { count, email, recordId, text } from '../values'

export interface RawStoreHippoUser {
  _id?: string
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  created_on?: string
  updated_on?: string
  total_order_count?: number
  role?: string
  [key: string]: unknown
}

export function transformCustomer(raw: RawStoreHippoUser): Customer {
  const id = recordId(raw, 'user')
  const address = email(raw.email)
  const ordersCount = count(raw.total_order_count)
  return {
    id,
    ...(address ? { email: address } : {}),
    ...(text(raw.first_name) ? { firstName: raw.first_name } : {}),
    ...(text(raw.last_name) ? { lastName: raw.last_name } : {}),
    ...(text(raw.phone) ? { phone: raw.phone } : {}),
    ...(ordersCount !== undefined ? { ordersCount } : {}),
    ...(text(raw.created_on) ? { createdAt: raw.created_on } : {}),
    ...(text(raw.updated_on) ? { updatedAt: raw.updated_on } : {}),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: customer.email,
    fname: customer.firstName,
    lname: customer.lastName,
    phone: customer.phone,
    subscribe: customer.acceptsMarketing,
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body['addresses'] = [
      {
        address1: a.line1,
        address2: a.line2,
        city: a.city,
        state: a.region,
        pincode: a.postalCode,
        country: a.country,
        isDefault: true,
      },
    ]
  }
  return body
}
