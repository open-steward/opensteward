/**
 * Sezzle customers are **tokenized customers** — a shopper who agreed to let
 * the merchant charge them again without a fresh checkout. The list/get
 * endpoints (`GET /v2/customer`, `GET /v2/customer/{uuid}`) return a token
 * record keyed on `uuid`, with a tokenization `expiration` (ISO-8601). When a
 * customer was created from an order, contact fields may also be present.
 *
 * There is no `created_at`; we surface the tokenization `expiration` in
 * metadata rather than a canonical timestamp field.
 *
 * Docs:
 *   https://docs.sezzle.com/docs/api/tokenization/customers/getv2customerlist
 *   https://docs.sezzle.com/docs/api/tokenization/customers/getv2customer
 */
import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

export interface RawSezzleCustomer {
  uuid?: string
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  expiration?: string
  [k: string]: unknown
}

export function transformCustomer(raw: RawSezzleCustomer): Customer {
  const name = [raw.first_name, raw.last_name].filter(Boolean).join(' ').trim()
  return {
    id: String(raw.uuid ?? ''),
    externalId: String(raw.uuid ?? ''),
    email: raw.email,
    name: name || undefined,
    phone: raw.phone,
    gateway: 'sezzle',
    metadata: strMap({ tokenization_expiration: raw.expiration }),
    raw,
  }
}
