# Agiloft adapter

Agiloft Contract Lifecycle Management (CLM) REST interface → canonical docsign schema.

OAuth2 Authorization-Code Grant + per-tenant REST. Operations are
`GET https://{host}/ewws/{operation}/.json?$KB={kb}&$table={table}&$lang=en&…`
(JSON decorator); host + KB are collected per connection and round-tripped on
`credentials.extra`. Token sent as `Authorization: Bearer`.
`AGILOFT_CLIENT_ID` / `AGILOFT_CLIENT_SECRET` env vars.

Canonical mapping:

- Envelope ← Contracts table (`contract`) record: listed with EWSearch
  (`field=id&field=contract_title1`, 0-based `page` + `limit`), read with EWRead.
  Only `id` and `contract_title1` are read; status is `unknown` because the
  public docs give no logical name for the Status field.
- Paging limits: no `search`/`query` or sort is sent (none is documented as required for a
  Bearer call, and no sort parameter is documented). Every REST call rebuilds the query, so
  pages are not stable while contracts change: "the logical page boundaries might shift when
  iterating the query page by page" (REST - Search).
- Retries: `err_code_resp=1` makes failures real HTTP statuses. Only 429/502/503/504 are
  retried; a 500 is not, because the documented error table uses 500 for a revoked token.

Refused before any request (501 NOT_SUPPORTED):

- documents — attachments live in a separate Attachments table whose logical name
  the public docs do not give.
- audit-trail entries — record history is an embedded History field no REST
  operation reads.

Not implemented (no standard REST resource in a generic KB): signers, templates → auto-501.
No outbound HMAC-signed webhook over the REST interface, so no webhook verification.

Docs: https://help.agiloft.com/space/HELP/43715778 (REST Interface),
https://help.agiloft.com/space/HELP/43717730 (REST - Search).
