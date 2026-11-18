/**
 * What the Ozon Seller API offers, per canonical resource.
 *
 * `availableResources` means Ozon has the resource, not that this adapter
 * implements every verb on it (see scripts/check-adapter-declarations.ts).
 * Two of them are declared available but not yet implemented, deliberately:
 *
 *  - product: Ozon has since retired every product-read method in its last
 *    publicly retrievable spec (`/v2/product/list`, `/v2/product/info/list`
 *    answer 404 as of 2026-09-13). Their replacements (`/v3/product/list`,
 *    `/v3/product/info/list`) are live, but their request/response shapes
 *    could not be read from an official source — docs.ozon.ru serves an
 *    anti-bot challenge to non-browser clients — so they are not guessed.
 *  - fulfillment: `/v4/posting/fbs/ship` is live, but its response schema is
 *    not resolvable in the retrieved spec.
 *
 * Sources: https://docs.ozon.ru/api/seller/ and the archived official spec
 * https://web.archive.org/web/20240531073337/https://docs.ozon.ru/api/seller/swagger.json
 */
export const metadata = {
  platform: 'ozon',
  totalResources: 10,
  availableResources: [
    'product',
    'inventory',
    'location',
    'order',
    'fulfillment',
    'refund',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'customer',
      reason:
        'The Ozon Seller API has no customer resource: none of its method groups (Product, Prices&Stocks, Warehouse, FBS, FBO, Returns, Chat, Finance, Analytics, …) lists or fetches buyers. Buyer contact details appear only embedded in individual rFBS postings.',
    },
    {
      resource: 'collection',
      reason:
        'Ozon is a marketplace with a platform-owned category tree; the Seller API lets a seller assign a product to a description category but has no seller-defined product collections to list or edit.',
    },
    {
      resource: 'discount',
      reason:
        'The Seller API has no discount codes or price rules. Its Promos methods only let a seller join or leave marketplace-wide campaigns that Ozon itself runs.',
    },
  ],
} as const
