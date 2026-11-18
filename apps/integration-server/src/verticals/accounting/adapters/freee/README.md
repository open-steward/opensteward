# freee adapter

freee Accounting API (`https://api.freee.co.jp/api/1/`) → canonical accounting
schema.

Reference: freee's own OpenAPI documents in
https://github.com/freee/freee-api-schema. The accounting API is
`v2020_06_15/open-api-3/api-schema.json`, the file
developer.freee.co.jp/reference/accounting/reference loads. The freee Invoice
(freee請求書) API is `iv/open-api-3/api-schema.yml`. Both were checked 2026-09-29.

## Credit memos: refused (501)

`listCreditMemos` and `getCreditMemo` throw 501 `NOT_SUPPORTED` before any
request. They used to call `GET credit_invoices` and `GET credit_invoices/{id}`.
Neither spec has a credit invoice or credit note anywhere:

- The accounting spec has no `credit_invoice` path or schema. Its only `credit*`
  names are the bookkeeping side (`credit`, `credit_amount`) and the
  `credit_card` account type.
- The Invoice API spec covers invoices, quotations, delivery slips, receipts,
  payment notices and purchase orders, each with `cancel`/`uncancel`. None of
  them is a credit note.

## Known issues in the other methods (not rebuilt)

Found while checking the credit memo sources against the accounting spec:

- **`listTransactions` / `getTransaction` call `bank_transactions`,** which is
  not in the spec. The documented account-statement resource is `wallet_txns`
  (`GET /api/1/wallet_txns`, `limit` ≤ 100).
- **`listBills` / `getBill` read `expense_applications`,** a documented
  endpoint for expense claims, not supplier bills. It is the same source
  `listExpenses` reads.
- **`listOrders` and `listSalesOrders` both read `quotations`** (documented).
  That makes each quotation both an order and a sales order.
