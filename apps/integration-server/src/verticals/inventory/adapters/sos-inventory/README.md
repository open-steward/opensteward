# SOS Inventory adapter

QuickBooks-integrated inventory and order management platform.

Auth: OAuth 2.0 authorization-code flow. Customers register an application at developer.sosinventory.com to obtain a clientId and clientSecret. Tokens are short-lived; the adapter drives refresh via the `refresh_token` grant.

Base URL: `https://api.sosinventory.com/api/v2`
OAuth authorize: `https://api.sosinventory.com/oauth2/authorize`
OAuth token: `https://api.sosinventory.com/oauth2/token`

Pagination: `start` (a 1-based row number: `start=201` is the second page of 200) + `maxresults` (at most 200) on every list endpoint, item and location alike; envelope: `{ count, totalCount, data[], status, message }`. The adapter declares `maxPageSize: 200` and reports `totalCount`, so the end of a collection is exact.

The 1-based `start` rests on the docs' two worked examples (`start=201` after 200 rows; `start=101&maxresults=100`). It has not been checked against a live account, and at least one third-party client sends 0-based offsets. Comparing `GET /item?start=1&maxresults=2` with `start=2` settles it.

Stock levels at one location: the `location` filter on `GET /item` takes the location's *name* (the docs' example is `location=warehouse`). The adapter resolves a canonical `locationId`, which is the SOS id, through `GET /location/{id}` first. The rows keep the id.

Not forwarded yet: `updated_after`. SOS documents `updatedsince` as `YYYY-MM-DDTHH:MM:SS` with no time zone, so which zone it reads that in needs a live check before a filter can be trusted not to drop rows.

Webhooks: SOS Inventory v2 does not document HMAC/JWT webhook signing; `verifyWebhook` and `parseWebhookEvents` are not implemented.

Rate limits: 100 calls per connection per 60 s.

## Refused
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing order data
