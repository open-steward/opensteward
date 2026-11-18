/**
 * GoCardless PaymentMethod transform.
 *
 * GoCardless does not have a traditional payment-method object (card, bank
 * account). Instead, bank debits are authorised via **Mandates** — a customer's
 * authorisation to collect future payments. The canonical PaymentMethod entity
 * is fulfilled by the mandate transform.
 *
 * This file re-exports from mandate.ts so the audit manifest sees a
 * `payment-method.ts` transform file aligned to the canonical entity name.
 */
export {
  transformMandate as transformPaymentMethod,
  type RawGCMandate as RawGCPaymentMethod,
} from './mandate'
