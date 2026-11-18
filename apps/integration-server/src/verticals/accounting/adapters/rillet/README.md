# Rillet adapter

Rillet Accounting API → canonical accounting schema.

Base URL `https://api.rillet.com`, API key as `Authorization: Bearer …`
([getting started](https://docs.api.rillet.com/docs/getting-started.md)).
Reference index: https://docs.api.rillet.com/llms.txt. Every page cited here
was fetched on 2026-09-29.

## API version: v4

The client sends `X-Rillet-API-Version: 4` (`constants.ts`). Getting started:
"We strongly recommend always specifying an explicit version", and the
default when no header is sent changes to the latest version on 2026-08-01.
Every page under `https://docs.api.rillet.com/reference/` declares
`"version": "v4.0"` with the header value `"4"`. The v3.0 pages are under
`https://docs.api.rillet.com/v3.0/reference/`.

The adapter sent `3` until 2026-09-29. The credit memo transform
already followed v4.0, so on live data `appliedTo`, `paidAmount` and
`balanceAmount` came back empty, and the v4-only statuses never arrived.

### What v4.0 changes, per resource the adapter reads

The v3.0 and v4.0 OpenAPI definitions embedded in each reference page were
diffed for every path the adapter calls. **No path, list parameter the adapter
sends (`limit`, `cursor`, `updated.gt`), list key or `pagination.next_cursor`
shape changed.** v4.0 only adds optional filters (`/invoices`
`external_reference_id`/`type`; `/journal-entries` `book_id`, `account_ids`),
which the adapter does not send.

| Resource                                       | Endpoint                                                                                                                                                                                                                                                                                              | v4.0 change                                                                                                                                                                                                                                                            | Adapter                                               |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| credit memo                                    | `GET /credit-memos`, `/credit-memos/{id}` ([list](https://docs.api.rillet.com/reference/list-all-credit-memos.md))                                                                                                                                                                                    | adds `applications[]`, `applied_amount`, `remaining_amount`; drops `amount_due`, `due_date`, `invoice_id`; status enum is now UNAPPLIED, PARTIALLY_APPLIED, APPLIED, REFUNDED (was UNPAID, REFUNDED, APPLIED, APPLIED_TO_BALANCE); item `quantity` is a decimal string | transform already v4.0                                |
| invoice                                        | `GET /invoices`, `/invoices/{id}` ([list](https://docs.api.rillet.com/reference/list-all-invoices-1.md))                                                                                                                                                                                              | item `quantity` is a decimal string; adds `shipping_customer_id`, `metadata`; addresses gain an `id`                                                                                                                                                                   | quantity parsed as a decimal (a number still parses)  |
| contact                                        | `GET /customers`, `/vendors` ([customers](https://docs.api.rillet.com/reference/list-all-customers-1.md))                                                                                                                                                                                             | customers add `billing_addresses[]` / `shipping_addresses[]`; `address` / `shipping_address` are deprecated copies of the first entry                                                                                                                                  | reads the first list entry, then the deprecated field |
| journal                                        | `GET /journal-entries` ([list](https://docs.api.rillet.com/reference/list-all-journal-entries.md))                                                                                                                                                                                                    | entry adds required `book_id`; item adds `original_transaction_amount`                                                                                                                                                                                                 | no mapping change (kept in `metadata`)                |
| account                                        | `GET /accounts` ([list](https://docs.api.rillet.com/reference/list-all-accounts.md))                                                                                                                                                                                                                  | adds `parent_grouping`, `prepaid_account_code`                                                                                                                                                                                                                         | no mapping change                                     |
| transaction                                    | `GET /bank-transactions` ([list](https://docs.api.rillet.com/reference/list-all-bank-transactions.md))                                                                                                                                                                                                | adds `reconciled_transactions[]`                                                                                                                                                                                                                                       | no mapping change                                     |
| bill, expense (charge), tax rate, organization | [bills](https://docs.api.rillet.com/reference/list-all-bills-1.md), [charges](https://docs.api.rillet.com/reference/list-all-charges.md), [tax rates](https://docs.api.rillet.com/reference/list-all-tax-rates.md), [organization](https://docs.api.rillet.com/reference/retrieve-an-organization.md) | bill and charge item `tax_rate.percentage` (`ExpenseTaxRate`) is a decimal string (was a number); tax rate and organization unchanged                                                                                                                                  | none (percentage is not read)                         |

## Paging

Cursor-paged lists (`invoices`, `bills`, `customers`, `vendors`,
`journal-entries`, `bank-transactions`, `credit-memos`, `charges`) go through
`pageByCursor` / `pageByRows` and report their end with `reportUpstreamPage`;
`limit` is clamped to the documented maximum of 100. `/accounts` and
`/tax-rates` document no paging and are served whole through `pageLocally`,
following a `next_cursor` should one come back.

## Writes

| Method                                         | Endpoint                                                                                                                                                                                      | Body                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createInvoice`                                | `POST /invoices` ([ref](https://docs.api.rillet.com/reference/create-an-invoice-1.md))                                                                                                        | `scope: "FULL"` (`CreateFullInvoiceRequest`): `customer_id` ← `contactId`, `invoice_date` ← `postedAt`, `due_date` ← `dueAt`, `memo` ← `notes`, `purchase_order_number` ← `reference`; each item `description` ← `itemDescription` (or `itemName`), `price.product_id` ← `itemId`, `price.quantity` ← `unitQuantity`, `price.amount_per_unit` ← `unitAmount`, and `revenue.account_code` ← `accountCode`, or `accountId` resolved through the chart, when given |
| `createBill`                                   | `POST /bills` ([ref](https://docs.api.rillet.com/reference/create-a-bill-1.md))                                                                                                               | `vendor_id`, `expense_number` ← `billNumber`, `bill_date`, `due_date`, items `account_code` + `amount` ← `totalAmount`                                                                                                                                                                                                                                                                                                                                          |
| `createJournal`                                | `POST /journal-entries` ([ref](https://docs.api.rillet.com/reference/create-a-journal-entry.md))                                                                                              | `name` ← `description`, `currency`, `date` ← `postedAt`; each item `account_code`, `side`, `amount`                                                                                                                                                                                                                                                                                                                                                             |
| `createExpense`                                | `POST /charges` ([ref](https://docs.api.rillet.com/reference/create-a-charge.md))                                                                                                             | `vendor_id` ← `contactId`, `charge_date` ← `postedAt`, `credit_card_account_code` or `funding_account_code` ← `accountId` (see below); items `account_code` + `amount` ← `totalAmount`                                                                                                                                                                                                                                                                          |
| `createContact`, `deleteInvoice`, `deleteBill` | unchanged                                                                                                                                                                                     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `updateContact`                                | `GET` then `PUT /customers/{id}` ([ref](https://docs.api.rillet.com/reference/update-a-customer-1.md)) or `/vendors/{id}` ([ref](https://docs.api.rillet.com/reference/update-a-vendor-1.md)) | read, merge, write: every documented request field of the stored record, with `name`, `emails`, `billingAddress`, `shippingAddress` (customers) or `name`, `emails` → `email`, `taxNumber` → `tax_id`, `billingAddress` → `address` (vendors) applied; see below                                                                                                                                                                                                |

**Account codes.** Bill, charge and journal lines, and an invoice item's
`revenue.account_code`, take the chart-of-accounts `account_code`, not the
account id (`JournalEntryItemRequest.account_code` is
required; the adapter used to send `account_id`, which the request schema
does not have). A line's `accountCode` is used as given; otherwise its
`accountId` is looked up in `GET /accounts`, read once per write. The
canonical journal line has no `accountCode`, so journal lines always resolve
by id. A bill, charge or journal line with neither, or an id not in the chart,
is a 400; an invoice line with neither posts to its product's revenue account
("If not provided, the one from the product will be used").

**Charge paying account.** `ChargeRequest` needs "Exactly one of
credit_card_account_code or funding_account_code": "The Credit Card liability
account for a post-paid card charge" or "The bank account reduced directly by
a pre-funded card charge". The canonical `Expense.accountId` is the account
the expense was paid from (Xero `BankAccount`, QuickBooks Purchase
`AccountRef`). It is looked up in the chart and its documented `type` picks
the field: LIABILITY → `credit_card_account_code`, ASSET →
`funding_account_code`. A missing `accountId`, one not in the chart, or any
other type is a 400.

Amounts are `RoundedMonetaryAmount` (invoice `amount_per_unit` is a `MonetaryAmount`): minor units are scaled by the currency's
own exponent (`money.ts`). No currency is assumed: a write without one is a 400.

### 400 VALIDATION_ERROR (before any write)

A value a required request field needs is missing: `createInvoice` without
`contactId`, `postedAt`, `currency`, a line, or a line's `itemId`,
description, `unitQuantity` or `unitAmount`; `createBill` without `contactId`,
`billNumber`, `postedAt`, `dueAt`, `currency`, a line or a line's
`totalAmount`; `createJournal` without `description`, `postedAt`, `currency`
or two lines, a line that is not exactly one positive debit or credit, or
debits that do not equal credits; `createExpense` without `contactId`,
`postedAt`, `accountId`, `currency`, a line, or a line's account or
`totalAmount`.

### 501 NOT_SUPPORTED (before any request)

- **`updateInvoice`**: `PUT /invoices/{id}` "is a full-replace operation"
  ([ref](https://docs.api.rillet.com/reference/update-an-invoice-1.md)); its
  FULL body requires `bank_account_id`, which no canonical Invoice field
  carries, and the Invoice response has no `scope` to tell a FULL invoice from
  a REVENUE_RECOGNITION_ONLY one, whose body differs.
- **Bill and charge line tax** (`taxAmount` / `taxrateId`): `tax_rate` is an
  `ExpenseTaxRate`, which requires `coverage` (INCLUSIVE | EXCLUSIVE) plus
  `country`, `description`, `percentage` and `type`; no canonical field carries
  them, and sending the line without it would book the tax as expense.
- **`createInvoice`** with an `invoiceNumber` (FULL assigns the number), a
  line `discountAmount` (`amount_per_unit` is the rate "after applying the
  discount", and the reference does not state whether an `AmountDiscount`
  `amount_off` is per unit or per line), or a line
  `taxAmount` / `taxrateId` (`TaxRateWithOptionalAmountAndCode` requires
  `country`, `description`, `percentage` and `type`). Dropping any of these
  would change the invoice.

## `updateContact`: read, merge, write

`PUT /customers/{id}` and `PUT /vendors/{id}` are full replaces: "omitting any
field will set it to null, wiping existing data. Always call retrieve-a-customer
first to fetch the current record, then include ALL existing fields"
([customer](https://docs.api.rillet.com/reference/update-a-customer-1.md),
[vendor](https://docs.api.rillet.com/reference/update-a-vendor-1.md)). The
adapter reads the record, customer first and vendor only on a 404
([retrieve-a-customer](https://docs.api.rillet.com/reference/retrieve-a-customer-1.md),
[retrieve-a-vendor](https://docs.api.rillet.com/reference/retrieve-a-vendor-1.md)),
rebuilds the request from every field of `UpdateCustomerRequest` /
`VendorRequest` it carries, applies the canonical changes and PUTs the whole
body (`contact-update.ts`). Response-only fields (`id`, `updated_at`,
`family_id`, `parent_customer_id`) and anything undocumented are never sent;
customer `metadata` is omitted, which keeps it, and the deprecated `address` /
`shipping_address` are sent only when the record has no address list (they
"Cannot be combined" with the lists). It used to send only `name` and emails,
wiping the rest.

Refused with 400 before the PUT, when the value is a change: telephones (no
field on either), a customer `taxNumber` (`tax_ids` entries need a `type`
the canonical field lacks), a vendor `shippingAddress` or more than one vendor
email, an address left without `line1`, `city`, `zip_code` and `country`,
clearing a customer address when the response carries no address list (an
empty list would remove every stored address; with a list, clearing drops only
the default and the next address takes its place), turning a customer into a vendor or back, and any other canonical field with no
documented request field (`currency`, `isActive`, `companyName`, ...).

## Not provided by Rillet

Declared in `metadata.ts`: orders, sales orders and purchase orders.
