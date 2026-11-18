import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

/**
 * Modern Treasury ExternalAccount → PaymentMethod.
 *
 * Modern Treasury does not have a first-class "payment method" object.
 * External accounts (bank accounts attached to counterparties) are the
 * closest equivalent: they store routing/account details for ACH, wire,
 * and similar rails.
 *
 * Endpoint: GET /external_accounts, GET /external_accounts/{id}
 * Docs: https://docs.moderntreasury.com/platform/reference/external-accounts
 */
export interface RawModernTreasuryExternalAccount {
  id?: string
  account_type?: string          // 'checking' | 'savings' | 'crypto_wallet' | etc.
  party_name?: string | null     // legal name of the account holder
  party_type?: string | null     // 'business' | 'individual'
  counterparty_id?: string | null
  account_details?: Array<{
    account_number?: string
    account_number_type?: string // 'iban' | 'hk_number' | 'clabe' | 'pan' | 'wallet_address' | 'other'
  }>
  routing_details?: Array<{
    routing_number?: string
    routing_number_type?: string
    bank_name?: string | null
  }>
  verification_status?: string   // 'pending_verification' | 'unverified' | 'verified'
  metadata?: Record<string, string>
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapPaymentMethodType(acctType: string | undefined | null): PaymentMethodType {
  const v = (acctType ?? '').toLowerCase()
  if (v === 'checking' || v === 'savings') return 'bank_account'
  if (v === 'crypto_wallet' || v === 'wallet_address') return 'wallet'
  return 'bank_account'
}

export function transformPaymentMethod(raw: RawModernTreasuryExternalAccount): PaymentMethod {
  const id = String(raw.id ?? '')

  const firstAccount = (raw.account_details ?? [])[0]
  const last4 = firstAccount?.account_number
    ? firstAccount.account_number.slice(-4)
    : undefined

  const firstRouting = (raw.routing_details ?? [])[0]
  const bankName = firstRouting?.bank_name ?? undefined

  return {
    id,
    externalId: id,
    customerId: raw.counterparty_id ?? undefined,
    type: mapPaymentMethodType(raw.account_type),
    holderName: raw.party_name ?? undefined,
    last4,
    bankName,
    gateway: 'modern-treasury',
    metadata: strMap(raw.metadata ?? {}),
    createdAt: raw.created_at ?? undefined,
    updatedAt: raw.updated_at ?? undefined,
    raw,
  }
}
