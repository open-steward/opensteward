# Lleida.net Click & Sign adapter

Lleida.net Click & Sign REST API → canonical docsign schema.

## Onboarding

1. Create a Lleida.net account and enable Click & Sign.
2. In the Lleida.net back office, open the **API** section and copy your **API key**.
3. Note your account **user** (the Lleida.net login) — it is sent in every request body.

The adapter authenticates with a static API key; there is no OAuth flow.
Credentials are collected through the Connect Link form:

- **Click & Sign API key** — sent as the `Authorization: x-api-key <key>` request header.
- **Account user** — sent as the `user` field in every request body.

## Endpoint

All operations are POSTs to `https://api.lleida.net/cs/v1/<action>` with the
action name echoed (upper-cased) in the body's `request` field. There is no
per-account host; tenants are scoped by the `user` + API key. The API exposes
no separate sandbox host.

## Resource mapping

| Canonical resource   | Click & Sign source                                        |
| -------------------- | ---------------------------------------------------------- |
| Envelope             | A signature process (`get_signature_list`)                 |
| Signer               | A signatory on the process (`get_signatory_details`)       |
| Document             | `get_file_list` (`file_group: START_FILES`), metadata only |
| Audit-trail entry    | Synthesised from signature/signatory status timestamps     |

Templates are not exposed — Click & Sign "configs" are callback/branding
settings, not document templates, so `listTemplates`/`getTemplate` auto-501.

## Pagination

`get_signature_list` is not page-paginated — it windows by `start_date`/
`end_date` (UNIX seconds, max 31-day interval) and returns every matching row.
The adapter defaults to the last 31 days and narrows by `updatedAfter` /
`signature_status` when supplied.

## Webhooks

Click & Sign delivers status callbacks to per-config callback URLs, but
publishes no signature/HMAC verification scheme (only optional AES-256-CBC
payload encryption), so the adapter exposes no webhook methods.

## Refused fields

- Document content (`get_file_list` returns metadata; the file-download
  endpoint is intentionally not called)
- Signatory evidence / signature images
- Identity-verification (KYC) attachments

These are not on the canonical schema. The adapter never requests them.
