---
vertical: docsign
title: Document Signing
last_verified: 2026-06-14
written_by: claude
---

# Document Signing (`docsign`)

Unified read surface across the major e-signature platforms. 48 adapters are listed below.

**Enterprise + ecosystem:**
- [DocuSign](./docusign.md) — enterprise reference
- [Adobe Acrobat Sign](./adobe-acrobat-sign.md) — Adobe Document Cloud
- [Dropbox Sign](./dropbox-sign.md) — formerly HelloSign
- [Box Sign](./box-sign.md), [Zoho Sign](./zoho-sign.md), [OneSpan Sign](./onespan-sign.md)

**Mid-market + SMB:**
- [PandaDoc](./pandadoc.md) — template-first, [SignNow](./signnow.md) — mid-market, [SignWell](./signwell.md), [GetAccept](./getaccept.md), [Foxit eSign](./foxit-esign.md), [Nitro Sign](./nitro-sign.md), [eversign](./eversign.md), [RightSignature](./rightsignature.md), [SignEasy](./signeasy.md) — global SMB, DigiSigner — US SMB freemium, [Concord](./concord.md) — US CLM + e-sign, DocSpring — template-first PDF

**EU eIDAS-qualified:**
- [Yousign](./yousign.md) — EU-native, [Skribble](./skribble.md), [Signaturit](./signaturit.md), [Universign](./universign.md), [Namirial](./namirial.md), [Sproof Sign](./sproof-sign.md), Lex Persona — France, [D-Trust sign-me](./d-trust-sign-me.md) — Germany / Bundesdruckerei QTSP, InfoCert — Italy QTSP, A-Trust — Austria / public-sector, SwissSign — Switzerland / Swiss Post, LuxTrust — Luxembourg national PKI, Signhost — Netherlands / Evidos+Entrust, [Autenti](./autenti.md) — Poland, Dokobit — Lithuania / Baltic + Nordic, eID Easy — Estonian eIDAS aggregator (Smart-ID/MitID/BankID)

**Nordic:**
- [Scrive](./scrive.md) — Sweden / Nordic-wide eIDAS QES, [Penneo](./penneo.md) — Denmark / audit-accounting focus, [Visma Sign](./visma-sign.md) — Finland / Visma stack, [Oneflow](./oneflow.md) — Sweden / contract-automation

**LatAm:**
- [Clicksign](./clicksign.md), [D4Sign](./d4sign.md), [Autentique](./autentique.md) — Brazil, Mifiel — Mexico eIDV QES

**APAC + other regional:**
- [CloudSign](./cloudsign.md) — Japan (GMO), [emSigner](./emsigner.md) — India (eMudhra), [Digio](./digio.md), [Lealos](./lealos.md), [Modusign](./modusign.md), Annature — Australia

## Canonical resources

| Resource | Purpose |
|---|---|
| `Envelope` | Top-level signing transaction. Subject, sender, status, timestamps, signer + document ids. |
| `Signer` | Recipient on an envelope. Email, name, role (`signer` / `cc` / `approver` / `witness` / `editor` / `in_person_signer`), status, routing order. |
| `Document` | File attached to an envelope. **Metadata only** — name, size, page count, mime type, order. The canonical schema has no `content` / `url` / `previewUrl` field. |
| `AuditTrailEntry` | First-class per-envelope audit row. Actor, IP, event type (`created` / `sent` / `viewed` / `signed` / `declined` / `voided` / `expired` / …). |
| `Template` | Reusable envelope blueprint. Signer roles, document count. |

## Refused at the schema level

| Field | Why refused |
|---|---|
| Document content (bytes) | Contracts can hold attorney-client privilege, GDPR Art 9 medical, financial settlements, NDAs. Schema absence = firewall. Same pattern as the payments vertical's absent `pan` field. |
| Signature images | Biometric data concerns in some jurisdictions. |
| KYC attachments | Identity verification = Tier C territory, separate from envelope metadata. |

The adapter never requests these endpoints. A misconfigured adapter that did would have nowhere to put the data in the canonical schema.

## Regulatory posture

Read-only envelope metadata. **eIDAS, ESIGN/UETA, and state notary law are not triggered** for read-only metadata access — those regimes regulate the signing platforms themselves (the trust-service providers). GDPR applies to signer PII (email, name) and is handled the same way as in every other vertical.

## Endpoints

| Verb | Path | Description |
|---|---|---|
| `GET` | `/v1/docsign/envelopes` | List envelopes. |
| `GET` | `/v1/docsign/envelopes/{id}` | Get one envelope. |
| `POST` | `/v1/docsign/envelopes/{id}/void` | Void an open envelope. |
| `GET` | `/v1/docsign/signers?envelope_id=…` | List signers on an envelope. |
| `GET` | `/v1/docsign/signers/{id}` | Get one signer (where the platform exposes the lookup). |
| `GET` | `/v1/docsign/documents?envelope_id=…` | List document metadata for an envelope. |
| `GET` | `/v1/docsign/documents/{id}` | Get document metadata. |
| `GET` | `/v1/docsign/audit_trail_entries?envelope_id=…` | List audit-trail entries for an envelope. |
| `GET` | `/v1/docsign/templates` | List reusable templates. |
| `GET` | `/v1/docsign/templates/{id}` | Get one template. |

Every operation returns `501 Not Implemented` on adapters that do not expose that capability — for example, `GET /signers/{id}` is unsupported on Dropbox Sign because signature ids are not globally addressable. Use `listSigners(envelopeId)` and filter.

## Authentication

Tenant mode (`Authorization: Bearer oi_…`). All `/v1/docsign/*` requests additionally require a `connection_id` (UUID returned by the OAuth callback). No end-user mode — docsign is B2B.
