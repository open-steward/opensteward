/**
 * Jumpseller Coupon → canonical Discount.
 *
 * Jumpseller exposes promotional codes under a `promotions` or `coupons`
 * concept. The v1 REST API does not document a dedicated `/discounts.json`
 * or a dedicated coupon code endpoint in the v1 REST API.
 *
 * This module is a placeholder — the adapter omits discount methods so the
 * registry returns 501 automatically. If Jumpseller adds a dedicated coupon
 * endpoint this file should be updated.
 */

export {}
