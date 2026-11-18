# Saasu adapter

Saasu REST API → canonical accounting schema. Read-only.

Base URL `https://api.saasu.com/`. Reference: https://api.saasu.com/Help and
its per-endpoint pages (`/Help/Api/<VERB>-<Path>`), fetched 2026-09-29.
`index.ts` maps every method to its page.

## Authentication

The documented web-service-key method: "The use of wsAccessKey and FileId on
the URL as arguments". Every request carries `FileId` (the company file,
integer, required) and `wsAccessKey` as query arguments; no header carries the
key. The Connect Link form collects both (see `auth.ts`).

## Resources

| Resource       | Saasu endpoint                 | Selection                                                         |
| -------------- | ------------------------------ | ----------------------------------------------------------------- |
| organization   | `GET FileIdentity`             | the connection's file; `id` is its `FileId`                       |
| invoices       | `GET Invoices`, `Invoice/{id}` | `TransactionType` S, `InvoiceType` "Tax Invoice"                  |
| bills          | same                           | `TransactionType` P, `InvoiceType` "Tax Invoice" or "RCT Invoice" |
| expenses       | same                           | `TransactionType` P, `InvoiceType` "Money Out (Expense)"          |
| creditmemos    | same                           | `TransactionType` S, `InvoiceType` "Adjustment Note"              |
| salesorders    | same                           | `TransactionType` S, `InvoiceType` "Sale Order"                   |
| purchaseorders | same                           | `TransactionType` P, `InvoiceType` "Purchase Order"               |
| orders         | same                           | either order type (`type` SALES / PURCHASE)                       |
| contacts       | `GET Contacts`, `Contact/{id}` |                                                                   |
| accounts       | `GET Accounts`, `Account/{Id}` |                                                                   |
| journals       | `GET Journals`, `Journal/{id}` |                                                                   |
| taxrates       | `GET TaxCodes`, `TaxCode/{id}` | `id` is the tax code's numeric `Id`                               |

Saasu keeps every sale and purchase document in the one invoice resource; the
documented `InvoiceType` values are "Pre-Quote Opportunity", "Quote",
"Purchase Order", "Sale Order", "Tax Invoice", "Adjustment Note",
"RCT Invoice", "Money In (Income)", "Money Out (Expense)"
([GET Invoice/id](https://api.saasu.com/Help/Api/GET-Invoice-id-optionalargs)).
RCT invoices are purchases ([help/rcti](https://www.saasu.com/help/rcti/)).
Quotes, pre-quote opportunities, "Money In (Income)" and purchase-side
adjustment notes (supplier credits) are not mapped to any canonical resource.
A single GET of the wrong kind of document answers 404.

List responses are `{ <Resource>[], _links[] }` — `Invoices`, `Contacts`,
`Accounts`, `Journals`, `TaxCodes`; single GETs return the record at the top
level. A body without the documented array is a 502, never an empty page.

## Paging

`Page` and `PageSize` ("Maximum page size is 100. Defaults to 25"), declared
as `capabilities.maxPageSize = 100`. A short upstream page is the last; a
full one has more when `_links` carries `rel: "next"`. The link alone is not
trusted: the documented samples show it on a 2-row page at PageSize 25, and
following it past the end would spend the daily limit on empty pages.
GET Invoices has no `InvoiceType` filter, so each upstream page of one side is
filtered here and `hasMore` is always judged on the upstream page.
List rows are summaries (no line items); line items come with the single GET.
Nothing fetches a detail per row: Saasu allows 10,000 requests a day.

`updated_after` → `LastModifiedFromDate` + `LastModifiedToDate` (both are
required together) on Invoices, Contacts and Journals. Accounts and TaxCodes
document no such filter and are served whole (a superset).

## Units

Amounts are "decimal number" in the document's `Currency`, converted to
minor units with the currency's exponent. A tax code's `Rate` is a fraction
(the documented "Sale Inc GST" sample is 0.1) and is reported as a
percentage (10).

## Refused (501 NOT_SUPPORTED)

`listTransactions` / `getTransaction`: the API help lists no transaction
resource.
