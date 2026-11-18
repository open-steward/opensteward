/**
 * Spryker payments → canonical Transaction.
 *
 * Spryker Glue REST API does not expose a dedicated top-level `/transactions`
 * endpoint. Payment information is embedded within order responses under the
 * `payments` array attribute.
 *
 * Payment attributes on orders:
 *   amount, paymentProviderName, paymentMethodName
 *
 * Note: Spryker Storefront Glue API does not expose a top-level transaction list
 * endpoint; the adapter does not implement transaction methods. This file retains
 * only the raw Spryker type shape for use by other modules.
 */

// ── Raw Spryker shape ─────────────────────────────────────────────────────────

export interface RawSprykerPayment {
  amount?: number | null
  paymentProviderName?: string | null
  paymentMethodName?: string | null
  [key: string]: unknown
}
