# LibreSign adapter

LibreSign (self-hosted Nextcloud signing app) REST API → canonical docsign schema.

LibreSign reaches the LibreSign app through the Nextcloud OCS gateway:
`${serverUrl}/ocs/v2.php/apps/libresign/api/v1/...`.

## Onboarding (api_key)

LibreSign has no OAuth of its own — it rides on Nextcloud auth. The supported
machine credential is a Nextcloud **app password** used as HTTP Basic.

1. In the target Nextcloud, log in as the user that should own the integration.
2. Go to **Settings → Security → Devices & sessions** and create an app password.
3. In OpenSteward's Connect Link form, provide:
   - **Nextcloud server URL** — e.g. `https://cloud.example.com`
   - **Nextcloud username** — the login name the app password belongs to
   - **App password** — the value generated in step 2 (stored as the API key)

The adapter sends `Authorization: Basic base64(username:appPassword)` plus the
required `OCS-APIRequest: true` header on every call.

## Resources

- **Envelopes** — LibreSign "files" (`GET /file/list`, `GET /file/validate/uuid/{uuid}`).
  A file bundles the PDF, the sign-requests, and the workflow status.
  `file/list` gets the caller's `page` and exact limit as `length` (no maximum is
  documented), and `pagination.next` (null on the last page) decides `hasMore`.
- **Signers** — the `signers[]` array on a validated file.
- **Documents** — the file itself (metadata only: name, size, page count, MIME).
- **Audit-trail entries** — synthesised from the file + per-signer lifecycle
  timestamps (`created_at`, `request_sign_date`, `sign_date`).

### Not supported

- **Templates** — LibreSign has no template API (`listTemplates`/`getTemplate`
  are absent; the router returns 501).
- **Void** — there is no envelope-void endpoint (`voidEnvelope` is absent).
- **Webhooks** — LibreSign only offers a fire-and-forget `callback` registration
  with no documented signature scheme, so no webhook handling is wired.

## Status mapping

| LibreSign file status | Canonical envelope status |
| --------------------- | ------------------------- |
| 0 draft               | draft                     |
| 1 able to sign        | sent                      |
| 2 partially signed    | delivered                 |
| 3 signed              | completed                 |
| 4 deleted             | voided                    |
| any other value       | unknown                   |

## Refused fields

- Document content (the validate response's file URL is never surfaced on the
  canonical Document; only metadata is mapped)
- Signature images
- Identity-verification attachments

These are not on the canonical schema. The adapter never requests them.
