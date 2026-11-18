import { toIsoDatetime } from '@opensteward/shared'
import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { CURRENCY } from '../constants'
import { intOrUndefined, requireId, strOrUndefined, tagsMetadata } from './shared'

/**
 * Stark Bank Invoice Pull Subscription (Pix Automático), as
 * `GET /v2/invoice-pull-subscription` ("subscriptions") returns it.
 * Docs: https://docs.starkbank.com/api (The Invoice Pull Subscription object).
 */
export interface RawStarkBankInvoicePullSubscription {
  id?: string
  /** "Fixed amount to be charged every cycle in cents." 0 when the amount is variable. */
  amount?: number
  /** "Minimum amount limit in cents." */
  amountMinLimit?: number
  status?: string
  /** "Debtor CPF or CNPJ." */
  taxId?: string
  /** "Expected date to settle first pull request." */
  start?: string
  /** "Final date of the subscription." */
  end?: string
  created?: string
  updated?: string
  tags?: string[]
  [k: string]: unknown
}

/**
 * The status diagram's states are created, active, canceled, failed and
 * expired. "created" is a subscription still awaiting the payer's approval
 * ("due: Due date for payer approval or denial"), which is canonical
 * incomplete; "failed" has no canonical equivalent.
 */
function mapStatus(s: unknown): SubscriptionStatus {
  switch (s) {
    case 'created':
      return 'incomplete'
    case 'active':
      return 'active'
    case 'canceled':
      return 'cancelled'
    case 'expired':
      return 'expired'
    default:
      return 'unknown'
  }
}

export function transformSubscription(raw: RawStarkBankInvoicePullSubscription): Subscription {
  const id = requireId(raw, 'invoice pull subscription')
  // Stark Bank has no customer resource; the debtor is identified by taxId.
  const customerId = strOrUndefined(raw.taxId)
  if (customerId === undefined) {
    throw new Error(`Stark Bank invoice pull subscription ${id} has no taxId (debtor)`)
  }
  // "amount ... Required if the subscription has a fixed amount, and never sent
  // together with amountMinLimit": a fixed amount is one item; a variable one
  // (amount 0, amountMinLimit set) has no fixed unit amount to report.
  const amount = intOrUndefined(raw.amount)
  const items = amount !== undefined && amount > 0 ? [{ id, amount }] : []
  return {
    id,
    externalId: id,
    customerId,
    status: mapStatus(raw.status),
    currency: CURRENCY,
    items,
    billingAnchor: toIsoDatetime(raw.start),
    cancelAt: toIsoDatetime(raw.end),
    gateway: 'stark-bank',
    metadata: tagsMetadata(raw.tags),
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.updated),
    raw,
  }
}
