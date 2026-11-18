/**
 * Bridge payout -> canonical Payout.
 *
 * Source: the payout resource of GET /v3/payment/payment-account/payouts
 * (https://docs.bridgeapi.io/reference/listpayouts.md), fields `id`, `status`,
 * `client_reference`, `label` ("This label that will be displayed on your
 * bank account"), `amount` (number; the create body calls it "positive and up
 * to 2 decimals", i.e. major units), `currency`, `type` (manual|scheduled),
 * `beneficiary`, `created_at`, `updated_at`.
 *
 * Status enum: unknown, created, processing, execution_skipped, in_transit,
 * paid, recalled, canceled, rejected, failed. Those whose name states the
 * canonical meaning map to it; execution_skipped and recalled are described
 * nowhere and map to 'unknown'.
 */

import { majorToMinor } from '@opensteward/shared'
import type { Payout, PayoutStatus } from '../../../schema/payout'

export interface RawBridgeOpenBankingPayout {
  id: string
  beneficiary?: {
    id?: string
    company_name?: string
    bank_name?: string
    iban?: string
    bic?: string
  }
  status?: string
  client_reference?: string
  label?: string
  amount?: number
  currency?: string
  type?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

const STATUS: Record<string, PayoutStatus> = {
  created: 'pending',
  processing: 'pending',
  in_transit: 'in_transit',
  paid: 'paid',
  canceled: 'cancelled',
  rejected: 'failed',
  failed: 'failed',
}

export function transformPayout(raw: RawBridgeOpenBankingPayout): Payout {
  if (typeof raw.currency !== 'string' || raw.currency === '') {
    throw new Error(`Bridge payout ${raw.id} has no currency`)
  }
  const amount = majorToMinor(raw.amount, raw.currency)
  if (amount === undefined) throw new Error(`Bridge payout ${raw.id} has no amount`)
  const metadata: Record<string, string> = {}
  if (raw.client_reference) metadata.client_reference = raw.client_reference
  if (raw.type) metadata.type = raw.type
  if (raw.beneficiary?.id) metadata.beneficiary_id = raw.beneficiary.id
  if (raw.status) metadata.bridge_status = raw.status
  return {
    id: raw.id,
    externalId: raw.id,
    amount,
    currency: raw.currency.toUpperCase(),
    status: (raw.status && STATUS[raw.status]) || 'unknown',
    ...(raw.label ? { statementDescriptor: raw.label } : {}),
    gateway: 'bridge-open-banking',
    metadata,
    ...(raw.created_at ? { createdAt: new Date(raw.created_at).toISOString() } : {}),
    ...(raw.updated_at ? { updatedAt: new Date(raw.updated_at).toISOString() } : {}),
    raw,
  }
}
