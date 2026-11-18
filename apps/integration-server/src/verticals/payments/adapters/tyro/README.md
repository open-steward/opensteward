# Tyro adapter

Tyro Connect, read through its Reporting API
(https://docs.connect.tyro.com/docs/business-operations/reporting/overview.md).

| Resource | Methods | Upstream                                                                                       |
| -------- | ------- | ---------------------------------------------------------------------------------------------- |
| Charge   | list    | `GET /reporting/merchants/{mid}/transactions?transactionDate=&limit=&page=` (refunds excluded) |
| Payout   | list    | `GET /reporting/merchants/{mid}/settlements?settlementDate=`                                   |

`getCharge` and `getPayout` return 501: neither endpoint looks anything up by id.

## Lists need `updated_after`

A list without `updated_after` returns **501 NOT_SUPPORTED** before anything is
sent. Pass `updated_after`; the list then covers the UTC days from yesterday
back to that date, clamped to the 3-year retention.

Why no better paging exists: both Reporting endpoints take **one date per
request**, and the docs offer no wider window.

- Overview: "Both APIs are queried by merchant ID (`mid`) and date."
- Transactions (`https://docs.connect.tyro.com/_spec/api-explorer/reporting/1.0/index.yaml`):
  `transactionDate` is "The date (YYYY-MM-DD) that the terminal has processed
  the requested transactions. Must be within the past 3 years." Its other
  parameters are `limit` ("maximum: 2000") and `page`, which page **within**
  that one day.
- Settlements (same spec): the only query parameter is `settlementDate`,
  "Requested settlement date (YYYY-MM-DD). Must be within the past 3 years."
  The endpoint does not page.
- Overview: "Data is only available for dates within the past 3 years".

The spec documents no date range, no cursor across days, no updated-since
filter and no documented maximum other than the day itself. The other Tyro
lists do not cover merchant card transactions: Sales Data `GET /sales` is POS
sale data per location, and Embedded Payments
`GET /tap-to-pay/merchants/{merchantId}/transactions` covers tap-to-pay only.

So an unfiltered list bounded only by the 3-year retention sent one request per
day: **about 1,094 requests for page 1 of a merchant with no rows**, repeated on
every call, because the row pager reads page 1 afresh each time. A list with
`updated_after` sends one request per day of the window it names (plus a
`page=2..` request only for a day with more than 2,000 transactions).

Consequences:

- The sync worker sends no `updated_after`, so a sync **skips** charges and
  payouts for Tyro (a 501 refusal is recorded as skipped, not failed). Read
  them through the REST API with `updated_after`.
- `updated_after` bounds the transaction/settlement **date**, not a
  last-modified time. A settlement whose status changes after its day has
  fallen below `updated_after` is not re-read.
- The caller chooses the cost. The adapter caps the window only at the
  documented 3-year retention, so `updated_after` three or more years back
  still walks about 1,094 days. No tighter documented bound exists, so any
  smaller cap would be arbitrary.
- The refusal happens before any Reporting request, but not before a token
  mint: the auth middleware and the sync worker refresh an expired JWT before
  the list method runs. That costs at most one grant per 12-hour token life,
  well under the 12-per-11-hours limit quoted below.

## Auth

OAuth 2.0 client credentials (App integration), per connection: `client_id`,
`client_secret`, the merchant `mid`, and the settlement `currency` (Reporting
amounts are cents with no currency code). JWTs are cached per client
credentials because "If a partner requests more than 12 tokens within an
11-hour period the authorisation server will reject the requests."
Reporting needs production credentials: "Development/Sandbox credentials
cannot be used with the Reporting APIs".
