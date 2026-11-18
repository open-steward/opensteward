/**
 * Paydock customer → canonical Customer.
 *
 * Fields from the "Customer resource" table of Paydock's API reference
 * (https://documenter.getpostman.com/view/6912944/Uyr5my5q, folder
 * "customers"): `_id`, `first_name`, `last_name`, `email`, `phone`,
 * `description`, `default_source` ("Payment source used by default"),
 * `created_at`, `updated_at`. Paydock documents no metadata field on a customer.
 */
import type { Customer } from '../../../schema/customer'
import { optStr, requireId } from './shared'

export interface RawPaydockCustomer {
  [k: string]: unknown
}

export function transformCustomer(raw: RawPaydockCustomer): Customer {
  const id = requireId(raw['_id'], 'customer')
  const name = [optStr(raw['first_name']), optStr(raw['last_name'])].filter(Boolean).join(' ')
  return {
    id,
    externalId: id,
    email: optStr(raw['email']),
    name: name === '' ? undefined : name,
    phone: optStr(raw['phone']),
    defaultPaymentMethodId: optStr(raw['default_source']),
    description: optStr(raw['description']),
    gateway: 'paydock',
    metadata: {},
    createdAt: optStr(raw['created_at']),
    updatedAt: optStr(raw['updated_at']),
    raw,
  }
}
