# Odoo Sign adapter

Odoo's e-signature app, over the shared Odoo client
(`@opensteward/shared` `adapter/odoo`): JSON-2 (`/json/2/<model>/<method>`)
on Odoo 19+, External RPC (`/jsonrpc` `execute_kw`) on Odoo 14–18, as the
connection chooses. Read-only.

Auth: the shared Odoo form — Odoo URL, API version, database, login and API
key.

Webhook: none. Odoo documents no webhook signature.

## Who can connect

- **Enterprise only.** The editions page (https://www.odoo.com/page/editions)
  marks Sign as absent from Community. A Community server has no `sign.*`
  models, and every call fails.
- **Odoo Online needs a Custom plan.** "Access to data via the external API is
  only available on Custom Odoo pricing plans. Access to the external API is
  not available on One App Free or Standard plans." (both External API pages).

## Resources

| Canonical | Odoo                                                                                                                                         |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Envelopes | `sign.request`                                                                                                                               |
| Signers   | `sign.request.item`, reached through the request's `request_item_ids`                                                                        |
| Templates | `sign.template`; signer roles are the `sign.item.role` names on its `sign.item` fields (`responsible_id`)                                    |
| Documents | the request's template files: `sign.document` on 19.0+, `sign.template.attachment_id` on 18.0; name, size and MIME type from `ir.attachment` |

## Refused (501)

- Audit trail — Odoo publishes no model for a request's signing history.
- Voiding an envelope — no cancel/void method on `sign.request` is
  published. The adapter makes no writes.

## Where the field names come from

Sign's source is private (`github.com/odoo/enterprise`), so nothing here is
read from code. Every model and field is one Odoo's own published data writes
on the model — `github.com/odoo/industry` branches 18.0, 19.0 and master
(`*/data/sign_template.xml`, `*/demo/sign_request.xml`, view extensions in
`*/data/ir_ui_view.xml`) — or an automatic ORM field (`id`, `display_name`,
`create_uid`, `create_date`, `write_date`). The shared client asks
`fields_get` before each read and requests only the fields the server has, so
a field missing on some version is simply absent from the result.

## Caveats for callers

- **Status.** Odoo's full `state` selections are not published. Requests in
  `sent` map to `sent` and `signed` to `completed`; signers in `sent` map to
  `sent` and `completed` to `signed`. Anything else (including a request's
  `shared` state) is `unknown`, with Odoo's value in `metadata.state`.
- **Signing order** is always `parallel`: no signing-order field is published.
- **Sender** is the request's creator (`create_uid`).
- **Documents** are the files of the template the request was sent from, so
  their size and MIME type are those of the uploaded file, not of the signed
  copy. Their ids are `<envelopeId>:<file id>` (the `sign.document` id on
  19.0+, the `ir.attachment` id on 18.0), the shape `getDocument` takes;
  `metadata.model` says which.
- **Version detection.** The adapter tells 19.0's layout from 18.0's by
  whether `sign.item` has `document_id` (`fields_get`). Industry publishes no
  Sign data before 18.0, so 14.0–17.0 are assumed to match 18.0.
- **Signer emails** that are not valid addresses are left out of `email`.

Lists of envelopes and templates page with `search_read` `offset` / `limit`
in id order, with `search_count` for the total. `updated_after` filters both
on `write_date >=` (UTC). Signers and documents of one
envelope are read whole and paged locally.
