# Octopus adapter

Octopus (Inaras NV, Belgium) → canonical accounting schema.

Reference: the published OpenAPI 3.0.1 document
https://service.inaras.be/octopus-rest-api/v1/openapi.json, which is what
https://service.inaras.be/octopus-rest-api/swagger/ loads. Checked 2026-09-29.
Its server is `https://service.inaras.be/octopus-rest-api/v1`. Every data path
is under `/dossiers/{dossierId}/…` and takes the dossier token in a
`dossierToken` **header**.

## Credit memos: refused (501)

`listCreditMemos` and `getCreditMemo` throw 501 `NOT_SUPPORTED` before any
request, and `metadata.ts` declares `creditmemo` unavailable. They used to call
`GET salesInvoices?creditNote=true` and `GET salesInvoices/{id}`, and neither
path is in the spec.

The spec does document credit notes. They are a sign convention on ordinary
sales documents, not a resource or a flag:

- `POST /dossiers/{dossierId}/invoices`: "To create a credit note, the total
  amount and the lines have to be negative."
- `POST /dossiers/{dossierId}/buysellbookings`: "To book a credit note, the
  total amount should be negative, whilst the line amounts that 'contribute
  to' the credit note have to be positive."
- They are read back like any invoice: `GET /dossiers/{dossierId}/invoices`
  (one document, by `bookyearId` + `journalKey` + `documentSeqNr`) or
  `GET /dossiers/{dossierId}/invoices/modified` (by `bookyearId` +
  `journalKey` + `modifiedTimeStamp`, "Maximum allowed calls per day: 48").

**Why they are still refused.** Every one of those calls needs a `dossierId`
in the path and a `dossierToken` header, on the `…/octopus-rest-api/v1`
server. This adapter collects no `dossierId`, sends its token as
`Authorization: Bearer`, and targets `…/octopus-rest-api/api/` (see below).
Reading credit notes means rebuilding the connection first, which is outside
this change.

**`appliedTo` would stay empty even then.** The only reference from one sales
document to another is the Peppol
`peppolFields.billingReferences[].invoiceDocumentReference.id.value`, a
free-text document number, not an id in this adapter's Invoice space.

## Known issues in the other methods (not rebuilt)

Found while checking the credit memo sources: **no other method calls a
documented endpoint either.**

- **Base URL.** The adapter uses `…/octopus-rest-api/api/`; the spec's server
  is `…/octopus-rest-api/v1`.
- **Auth.** The adapter sends `Authorization: Bearer <token>`; the spec takes a
  `dossierToken` header. No `dossierId` is collected, yet every data path needs
  one.
- **Paths.** None of `dossier`, `salesInvoices`, `purchaseInvoices`,
  `relations/{id}`, `generalAccounts`, `bookings`, `payments` or `vatCodes`
  exists. The documented ones include `GET /dossiers`,
  `/dossiers/{dossierId}/relations` (GET, and PUT to create or modify, with no
  POST), `/accounts?bookyearId=`, `/vatcodes`, `/bookyears`,
  `/bookyears/{bookyearId}/journals`, `/buysellbookings/modified` and
  `/invoices/modified`.
- **Paging.** `page`, `pageSize` and `modifiedAfter` are not spec parameters.
  The spec's sync reads are the `…/modified` endpoints, which take
  `bookyearId`, `journalKey` and `modifiedTimeStamp` and carry daily call limits
  (for example "Maximum allowed calls per day: 48").
