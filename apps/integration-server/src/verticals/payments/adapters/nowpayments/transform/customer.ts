/**
 * NOWPayments customer (sub-partner) → canonical Customer.
 *
 * "Customer management / Get customers" (GET /v1/sub-partner) answers
 * {"result":[{"id":"111394288","name":"test","created_at":"...","updated_at":"..."}],"count":2};
 * https://documenter.getpostman.com/view/7907941/2s93JusNJt. Those four
 * fields are all a customer carries.
 */
import type { Customer } from '../../../schema/customer'
import { requireId } from './shared'

export interface RawNowpaymentsCustomer {
  id?: number | string | null
  name?: string | null
  created_at?: string | null
  updated_at?: string | null
  [k: string]: unknown
}

export function transformCustomer(raw: RawNowpaymentsCustomer): Customer {
  const id = requireId(raw.id, 'customer')
  return {
    id,
    externalId: id,
    name: raw.name ?? undefined,
    gateway: 'nowpayments',
    metadata: {},
    createdAt: raw.created_at ?? undefined,
    updatedAt: raw.updated_at ?? undefined,
    raw,
  }
}
