# Bokio adapter

Bokio Company API → canonical accounting schema.

Base URL `https://api.bokio.se/v1`, every path under `/companies/{companyId}`.
OAuth 2.0; the company id is the connection's tenant. Reference:
https://docs.bokio.se (index https://docs.bokio.se/llms.txt). `index.ts` maps
every method to its reference page. Every scope below is the "**Scope:**"
line of the endpoint's own page.

## Resources and the scopes behind them

| Resource                            | Bokio endpoint                                                                      | Read scope                 | Write scope               |
| ----------------------------------- | ----------------------------------------------------------------------------------- | -------------------------- | ------------------------- |
| organization                        | `GET company-information`                                                           | `company-information:read` | —                         |
| organization (`fiscalYearEndMonth`) | `GET fiscal-years`                                                                  | `fiscal-years:read`        | —                         |
| invoices                            | `GET invoices`, `invoices/{id}`                                                     | `invoices:read`            | refused (501)             |
| contacts (customers)                | `GET customers`, `customers/{id}`; `PUT`, `DELETE customers/{id}`                   | `customers:read`           | `customers:write`         |
| contacts (suppliers)                | `GET suppliers`, `suppliers/{id}`; `POST suppliers`, `PUT`, `DELETE suppliers/{id}` | `suppliers:read`           | `suppliers:write`         |
| accounts                            | `GET chart-of-accounts`, `…/{account}`                                              | `chart-of-accounts:read`   | —                         |
| journals                            | `GET journal-entries`, `…/{id}`; `POST journal-entries`                             | `journal-entries:read`     | `journal-entries:write`   |
| creditmemos                         | `GET credit-notes`, `credit-notes/{id}`; `POST invoices/{id}/credit`                | `credit-notes:read`        | `invoices:write`          |
| bills                               | `GET supplier-invoices`, `…/{id}`; `POST`, `PUT`, `DELETE`                          | `supplier-invoices:read`   | `supplier-invoices:write` |
| bill attachments                    | link to `GET uploads/{id}/download` (not called)                                    | `uploads:read` (see below) | —                         |

The read scopes are the default and read-only scope set (`BOKIO_DEFAULT_SCOPES`,
`scripts/curated-read-scopes.json`), except `uploads:read`: the adapter never
calls the download link, so the scope is only in `recommendedScopes`, for a
caller that follows it. Creating a credit note is
[`POST invoices/{id}/credit`](https://docs.bokio.se/reference/post-invoices-invoiceid-credit.md),
whose scope is `invoices:write`, not `credit-notes:write`.

### Scopes Bokio offers that this adapter does not use

- `items:read` / `items:write` ([get-items](https://docs.bokio.se/reference/get-items.md)):
  "Access to invoice line items and products" (Scopes page). The canonical
  accounting schema has no item resource.
- `projects:read` / `projects:write` ([list-projects](https://docs.bokio.se/reference/list-projects.md)):
  a project "enriches a dimension 6 (Project) tag value"; no canonical resource.
- `tags:read` / `tags:write` ([get-tag-groups](https://docs.bokio.se/reference/get-tag-groups.md)):
  tag groups and tags (dimensions); no canonical resource.
- `sie:read` ([download-sie-file](https://docs.bokio.se/reference/download-sie-file.md)):
  a whole fiscal year as a Swedish SIE export file, not a resource.
- `uploads:write` ([add-upload](https://docs.bokio.se/reference/add-upload.md)):
  a multipart file upload; no canonical attachment write.
- `credit-notes:write` ([update-credit-note-v1](https://docs.bokio.se/reference/update-credit-note-v1.md)):
  editing a draft credit note needs salesItem lines with `productType` and
  `taxRate`, which no canonical line carries.

`recommendedScopes` holds only scopes that map to a canonical resource:
`items`, `sie`, `projects` and `tags` are not in it. `uploads:write` and
`credit-notes:write` stay, as the write side of resources this adapter reads.

### Reconnect after upgrading

`suppliers:read` and `fiscal-years:read` joined the default and read-only
scope sets on 2026-09-29 (`supplier-invoices:read` earlier the same day). **A
connection made before then was not granted them: reconnect it** (run the
Connect Link again). Until it is reconnected it degrades instead of failing:

- contacts: Bokio's 403 on the first `GET suppliers` page is taken as no
  suppliers, so the list is the customers alone, with `hasMore` from the
  customer pages as before suppliers were read (a 403 on a later supplier
  page still fails); `getContact` on a supplier id answers the customer 404.
- organization: a 403 on `GET fiscal-years` leaves out the optional
  `fiscalYearEndMonth`.

Each logs one `[bokio]` warning per call naming the missing scope. Any other
error still fails. Bills have no fallback and fail with the 403 until the
connection is reconnected with `supplier-invoices:read`. Writes need the
matching `:write` scope selected on the connection.

## Contacts: customers, then suppliers

Bokio keeps customers and suppliers apart, each with its own uuid id
(`format: uuid` on both schemas). `listContacts` serves one stream: every
customer (`isCustomer: true`), then every supplier (`isSupplier: true`). Each
upstream page is asked for at the caller's page size (at most 100); the
customers are walked to their `totalPages`, then the suppliers to theirs, and
the shared `pageByRows` cuts caller page N as rows [(N-1)×limit, N×limit) of
that stream, so one page can hold the last customers and the first suppliers.
`hasMore` is exact: a page that ends on the last customer looks at the first
supplier page before answering.

`getContact`, `updateContact` and `deleteContact` GET the customer first and,
on Bokio's documented 404, the supplier with the same id, then act on the
one found. `deleteContact` does not infer the kind from a failed DELETE:
delete-customer.md documents only its 204, not what a missing id answers. A Bill's
`contactId` is `supplierRef.id`, so it resolves to a supplier contact.

`createContact` creates a supplier (`isSupplier: true`, `isCustomer` not true):
[post-supplier](https://docs.bokio.se/reference/post-supplier.md) requires only
`name`. A supplier takes name, identification → `orgNumber`, taxNumber →
`vatNumber`, currency and billingAddress → `address`; it has no contact
details, so emails and telephones are refused with a 400. Its
`paymentDetails` (bankgiro, plusgiro, transfer, international) have no
canonical counterpart and stay in `metadata`; an update sends them back
unchanged.

## Bills are a Preview API

Bills come from Bokio's **[Preview]** supplier-invoices API
([get-supplier-invoices](https://docs.bokio.se/reference/get-supplier-invoices.md),
[get-supplier-invoice-by-id](https://docs.bokio.se/reference/get-supplier-invoice-by-id.md)),
and suppliers are Preview too. Bokio may change or remove Preview endpoints and
fields before general availability
([preview policy](https://docs.bokio.se/reference/versioning.md)); the supplier
invoice rows were already renamed to `lineItems` on
[2026-09-07](https://docs.bokio.se/changelog/2026-09-07.md).

A supplier invoice has no status and no timestamps. The bill status is derived
from `remainingAmount` and `totalAmount`, compared as absolute values: 0 →
`PAID`, strictly between 0 and `totalAmount` with the same sign →
`PARTIALLY_PAID`, otherwise `AUTHORIZED`. `OVERDUE` is never derived (it would
need the clock); compare `dueAt` with today and `balanceAmount` > 0 at read
time.

A negative `totalAmount` is a supplier credit. It stays a bill with its
negative total and `balanceAmount`, gets its status by the same rule (−200 with
−100 remaining is `PARTIALLY_PAID`, with 0 remaining `PAID`), and carries
`metadata.supplierCredit: true`.

### VAT: line prices exclude it, `totalAmount` includes it

Observed on live data, 2026-09-29. The supplier-invoice schema has no tax total
and does not say whether `lineItems[].unitPrice` includes VAT, and the
documented examples cannot settle it (10 × 100 at 25 % beside `totalAmount:
1000`). A real Bokio sync did: three supplier invoices of two lines each gave
(SEK)

| Invoice | Lines              | Net  | `totalAmount` |
| ------- | ------------------ | ---- | ------------- |
| A       | 1 × 400 + 2 × 800  | 2000 | 2500          |
| B       | 1 × 800 + 3 × 800  | 3200 | 4000          |
| C       | 4 × 800 + 1 × 1200 | 4400 | 5500          |

`totalAmount` = net × 1.25 each time, so `unitPrice` excludes VAT and
`totalAmount` includes it. The live API sends the rows as `lineItems`, not the
older `rows`. So a bill with lines has `lineAmountsIncludeTax: false`; each
line with a numeric `taxRate` gets `taxAmount` = quantity × unitPrice ×
taxRate / 100 (rounded to minor units like every other amount); each line's
`totalAmount` is its net, quantity × unitPrice, because
`lineAmountsIncludeTax: false` makes line totals tax-exclusive (as Xero's
`LineAmount` is under `Exclusive`); and the header `taxAmount` is `totalAmount` − Σ line
net, set only when every line has a quantity and unitPrice. A bill without
lines leaves both unset.

`attachments` are the supplier invoice's `uploadRefs`: the upload id, and as
`url` the documented download path
`https://api.bokio.se/v1/companies/{companyId}/uploads/{id}/download`, which
needs the connection's bearer token and `uploads:read`. File name and MIME type
are not filled in: they would cost one `GET uploads/{id}` per attachment.

Writes ([post-](https://docs.bokio.se/reference/post-supplier-invoice.md),
[put-](https://docs.bokio.se/reference/put-supplier-invoice.md),
[delete-supplier-invoice](https://docs.bokio.se/reference/delete-supplier-invoice.md)):
`contactId`, `postedAt`, `dueAt` and `totalAmount` are required; lines need
`itemDescription` and `unitAmount`. A supplier invoice takes no currency of its
own, so `createBill` reads the supplier first and scales the minor units in
its currency (a different canonical `currency` is refused). `updateBill`
reads the supplier invoice and sends it back whole with the changes laid over
it, because PUT removes line items left out. One attachment id becomes the
`uploadRef` on create; PUT takes none.

## Credit memos

`createCreditMemo` credits one whole invoice as a draft: send
`appliedTo: [{ invoiceId }]` and nothing else. Anything more (lines, amounts,
a published status) is refused with a 400, because a partial credit is an edit
of the draft's salesItem lines, which need `productType` and `taxRate`.

## Not mapped

- Journal attachments: uploads carry a `journalEntryId`, but the canonical
  Journal has no attachments field.
- Invoice and credit-note `attachmentRefs` (invoice attachments, a separate
  API under `invoices:read`) are not mapped yet.

## Not provided by Bokio

Declared in `metadata.ts` (checked against https://docs.bokio.se/llms.txt on
2026-09-29):

- **transactions**: Bokio's API excludes bank transactions; journal entries
  are ledger postings, not transactions.
- **expenses**: Bokio uploads carry no amount, date or account; booked
  receipts appear as journal entries.
- **taxrates**: VAT exists only as a per-line `taxRate` on invoices.
- **orders, salesorders, purchaseorders**: Bokio has no order, quote or
  purchase-order endpoint.

## Refused (501)

`createInvoice` / `updateInvoice`, and `createContact` for a customer: see the
header of `index.ts` for the required Bokio fields that have no canonical
source.
