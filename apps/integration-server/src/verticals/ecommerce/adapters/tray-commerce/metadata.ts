/**
 * Resource declarations for Tray (Tray Corp / Locaweb, Brazil) — see
 * `scripts/check-adapter-declarations.ts` for the contract this file
 * satisfies. Every `available` resource here was verified path-by-path and
 * field-by-field with curl against developers.tray.com.br (the WebFetch
 * tool's summarizer was silently truncating the page — see `client.ts`'s
 * header). Variant CRUD is fully implemented too, at its own verified
 * resource (`/products/variants`, not `/variations` as first assumed) —
 * folded under `product` here rather than declared separately, matching
 * this vertical's convention (declaring `variant` pollutes the shared
 * resource vocabulary `scripts/check-adapter-declarations.ts` builds
 * across every ecommerce adapter, surfacing ~96 unrelated adapters as
 * "undeclared" for a resource they never opted into being scored on).
 */
export const metadata = {
  platform: 'tray-commerce',
  totalResources: 10,
  availableResources: ['collection', 'customer', 'inventory', 'location', 'order', 'product'],
  unavailableResources: [
    {
      resource: 'discount',
      reason:
        'Tray documents an extensive coupon ("Cupom") API — list, get, create, update, delete, ' +
        'plus relation endpoints to customers/products/categories/brands/shipping — confirmed to ' +
        'exist via the site’s own section index, but curl-fetching those sections returned only ' +
        'the headings, never field-level request/response detail. A coupon is a write-capable, ' +
        'money-affecting resource; guessing its field shape risks creating malformed discounts ' +
        'on a live store, which is worse than not implementing it yet.',
    },
    {
      resource: 'transaction',
      reason:
        'Tray documents a read-only "APIs de Informações de Pagamento" section (list + get), ' +
        'confirmed to exist via the site’s own section index, but curl-fetching it returned only ' +
        'the heading, never its endpoint path or field-level response shape, so no verified ' +
        'canonical-transaction mapping could be written. No payment-creation or refund endpoint ' +
        'is documented anywhere on the page.',
    },
    {
      resource: 'refund',
      reason:
        'No refund endpoint appears anywhere in developers.tray.com.br’s own table of contents ' +
        '(products, variants, categories, brands, customers, coupons, orders, Multi-CD, payment ' +
        'info, shipping) — Tray does not expose refund creation via this API.',
    },
    {
      resource: 'fulfillment',
      reason:
        'Tray’s only shipping-related endpoint is "API de Integração de Frete" ' +
        '(#calculo-de-frete-get) — a pre-checkout freight-rate calculator, not a post-order ' +
        'shipment/tracking resource. No tracking number, carrier, or shipment-status field or ' +
        'endpoint is documented on the Order resource anywhere on the page.',
    },
  ],
} as const
