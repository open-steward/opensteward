# QuickFile adapter

QuickFile JSON API v1.2 → canonical accounting schema.

Every call is `POST https://api.quickfile.co.uk/1_2/{resource}/{method}` with a
`{ payload: { Header, Body } }` request envelope. The Header is
`MessageType` ('Request'), `SubmissionNumber` and an `Authentication` block of
`AccNumber`, `MD5Value` (MD5 of account number + API key + submission number)
and `ApplicationID` ([Invoice_Search](https://api.quickfile.co.uk/d/v1_2/Invoice_Search),
and the request sample at `POST https://api.quickfile.co.uk/GetJsonSample/Invoice_Search/1_2`).
`auth.ts` builds this Header for every method. Before 2026-09-29 it put the three
credentials beside `MessageType` instead of inside `Authentication`.
Responses are keyed by the method name: `{ "Invoice_Search": { Header, Body } }`
(the same samples, and a live response in
[t/16824](https://community.quickfile.co.uk/t/16824)).

Reference checked 2026-09-29: https://api.quickfile.co.uk/ (method pages
under `/d/v1_2/<Method>`, JSON samples under `/GetJsonSample/<Method>/1_2`).

## Credit memos

A QuickFile credit note is an **INVOICE of negative value**. There is no
credit-note endpoint, and Invoice_Search's `InvoiceType` is only INVOICE,
ESTIMATE or RECURRING. Invoice_Create documents a `CreditNote` block as "meta
data for negative invoices", and the linked usage guide says credit notes "are
essentially negative value invoices"
([t/23204](https://community.quickfile.co.uk/t/creating-a-credit-note-using-the-api/23204)).

| Method            | Source                                                                          |
| ----------------- | ------------------------------------------------------------------------------- |
| `listCreditMemos` | `invoice/search` with `InvoiceType: INVOICE`, `AmountTo: 0`, then `Amount < 0`  |
| `getCreditMemo`   | `invoice/get` → `Invoice_Get.Body.InvoiceDetails`; 404 unless `TotalAmount < 0` |

- **Filter.** The search sends the documented `AmountTo: 0`, so QuickFile
  returns non-positive invoices only (the amount-range search the community
  answer in [t/5264](https://community.quickfile.co.uk/t/5264) uses). Whether
  the bound is inclusive is not documented, so rows are still filtered to
  `Amount < 0` here, which drops zero-value invoices.
- **Paging.** `ReturnCount` is 1–200 and `Offset` is a row offset
  ([t/4234](https://community.quickfile.co.uk/t/4234)). Each caller page is one
  upstream page, filtered, so a page can be short and still not be the last.
  `hasMore` comes from `Offset + rows < RecordsetCount`; `totalCount` is not
  reported, since `RecordsetCount` may include zero-value invoices.
- **One row arrives as an object.** The JSON API is a proxy over XML, so
  `Record` (and a credit note's `ItemLines.Item` / `TaskLines.Task`) is a bare
  object when there is exactly one
  ([t/16824](https://community.quickfile.co.uk/t/16824)). Both are read through
  `asArray`.
- **`updated_after` is not applied.** Invoice_Search has no modified-date
  filter; an issue-date filter would drop notes edited after the watermark.
- **Money.** Decimals in the document `Currency`, converted with
  `toMinorUnits(value, currency)`. Header amounts are magnitudes; line totals
  take the note's sign, so an opposite-sign line (a restocking fee) stays
  opposite. `LineTotal` is net of tax (`lineAmountsIncludeTax: false`).
- **`appliedTo` is not filled.** The parent invoice is only an input
  (`CreditNote.ParentInvoiceId` on Invoice_Create, and optional); no documented
  response returns it.

## Known issues in the other methods (not rebuilt)

Found while checking the credit memo sources against the same reference:

- **Responses are read from the wrong envelope.** Every other method reads
  `res.payload?.Body`, but responses are `{ "<Method>": { Header, Body } }`.
  Lists therefore come back empty and gets fall back to a stub record.
- **Detail keys differ from the documented ones.** `invoice/get` answers
  `Body.InvoiceDetails` (not `InvoiceData`), `purchase/get` `PurchaseDetails`,
  `client/get` `ClientDetails`, `supplier/get` `SupplierDetails`, and
  `system/getaccountdetails` `AccountDetails`.
- **Search requests omit mandatory parameters.** `OrderResultsBy` and
  `OrderDirection` are mandatory on Invoice_Search. `ShowNetAmount` and
  `ShowVatAmount` belong under `AdditionalParameters`, and `updatedAfter` is
  sent as `IssueDateFrom`, which is an issue-date filter.
- **`listInvoices` includes credit notes**, because they are INVOICEs.
- **A one-row result is dropped or mis-read.** The other list methods read
  `Body.Record` as an array, but a single match arrives as a bare object
  ([t/16824](https://community.quickfile.co.uk/t/16824)).
