# Privy (PrivyID) adapter

Privy merchant REST API → canonical docsign schema.

Privy (privy.id) is Indonesia's certified digital-identity and digital-signature platform. A Privy *document* is modelled as the canonical `Envelope`: it carries its title, owner, status, recipients (Signers / Reviewers) and the uploaded file inline.

## Onboarding

1. Create an enterprise/merchant account and open the [Privy Developer Console](https://console.privy.id).
2. Issue a **merchant key** for your enterprise integration.
3. In OpenSteward, connect the `privyid` adapter via Connect Link and paste the merchant key, then choose the environment (sandbox or production).

The adapter sends the key as the `Merchant-Key` request header — there is no OAuth flow for the merchant API.

## Sandbox vs production

The credential form selects the host:

- Sandbox: `https://api-sandbox.privy.id/v3/merchant`
- Production: `https://core.privy.id/v3/merchant`

## Supported resources

- **Envelopes** — Privy documents (`document/list`, `document/status/{docToken}`); `voidEnvelope` maps to document cancel.
- **Signers** — document recipients (Signers / Reviewers), read from the document detail.
- **Documents** — the single uploaded file, **metadata only**.

Privy's merchant API has no template resource and no separate audit-trail endpoint, so templates and audit-trail methods are intentionally not implemented (the router returns 501).

## Callbacks

Privy delivers registration- and document-status changes to a registered callback URL. These callbacks are not cryptographically signed (delivery is gated by the registered URL + merchant key), so no webhook signature verification is wired in this adapter.

## Refused fields

- Document content (`urlDocument` / `download` links are never mapped to a content/url field)
- Signature images
- Identity-verification (KYC) attachments — selfie / KTP

These are not on the canonical schema. The adapter never surfaces them.
