import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { moneyOf, requireId, resultGroup, strMap, type RawPeachTransaction } from './shared'

export type RawPeachCharge = RawPeachTransaction

function chargeStatus(code: string | undefined): ChargeStatus {
  const g = resultGroup(code)
  // "Chargeback-related result codes indicate that a previously successful
  // transaction has been reversed by the issuer or cardholder."
  if (g === 'chargeback') return 'disputed'
  return g
}

/**
 * A DB (debit) or PA (preauthorisation) record of GET /v3/query or
 * GET /v3/query/{id}. Only documented response fields are read.
 * https://developer.peachpayments.com/docs/oppwa-integrations-reporting
 */
export function transformCharge(raw: RawPeachCharge): Charge {
  const id = requireId(raw, 'charge')
  const { amount, currency } = moneyOf(raw, 'charge')
  const status = chargeStatus(raw.result?.code)
  const failed = status === 'failed'
  return {
    id,
    externalId: id,
    amount,
    currency,
    status,
    // DB "Debits the customer's account"; PA is a "Stand-alone authorisation"
    // that a separate CP (capture) record confirms.
    captured: raw.paymentType === 'DB' ? true : raw.paymentType === 'PA' ? false : undefined,
    paymentMethodId: raw.registrationId || undefined,
    failureCode: failed ? raw.result?.code : undefined,
    failureMessage: failed ? raw.result?.description : undefined,
    gateway: 'peach-payments',
    metadata: strMap(raw.customParameters),
    createdAt: toIsoDatetime(raw.timestamp),
    raw,
  }
}
