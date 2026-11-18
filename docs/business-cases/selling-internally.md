# Selling OpenSteward inside your organisation

> A field guide for the internal champion — the staff engineer, platform lead, or director who has already decided OpenSteward is the right call and now has to convince the seven people inside the building who can say no.

The hardest part of a self-hosted infrastructure decision is rarely the technical evaluation. It's the procession of one-on-ones that follow: the CISO who wants the threat model, the DPO who wants the processing record, the controller who wants the TCO model, the procurement officer who wants a vendor risk packet. Each of those people has a different concern, a different vocabulary, and a different bar for what counts as evidence. A champion who tries to give them all the same pitch loses every conversation.

This page is structured so you don't have to. Seven sections, one per stakeholder. Each section gives you their 90-second pitch, the objections they will raise, and the exact OpenSteward doc or screen to put in front of them. Skim the TL;DR table if you have a meeting in twenty minutes; read the full section if you have time to prepare.

If your organisation has different role titles, the function descriptions at the top of each section let you map. The doc is written for the champion in the second person — *you* are the person prepping. *They* are the stakeholder you're prepping for.

---

## TL;DR — your seven conversations, at a glance

| Stakeholder | 90-second pitch headline | Where to send them |
|---|---|---|
| **CISO / Head of Security** | Self-hosted, read-only by default, hardening controls built in and the remaining operator tasks named. No new third-party in your data path. | [`docs/security/README.md`](../security/README.md) |
| **DPO / Head of Privacy** | The data we read is data you already legally process. Connect Link strengthens your audit trail. No new international transfers, no new processing record. | [`docs/business-cases/README.md`](./README.md#what-rules-apply-to-the-data-we-read-per-vertical) — regulatory map per vertical |
| **CCO / Head of Compliance** | PCI-DSS not triggered (we never see PANs). SOX, GLBA, NAIC #672 apply to your existing perimeter unchanged. Read-only default; write scopes are an explicit opt-in. | [`banks.md` § The regulatory boundary](./banks.md#the-regulatory-boundary--read-only-by-default-no-new-regimes) or [`insurance.md`](./insurance.md) equivalent |
| **CFO / Controller** | Flat infrastructure cost. No per-call billing. A million syncs a month costs the same as a thousand. The model that breaks at 100 customers doesn't break at 10 000. | [`docs/why-opensteward.md` § No per-call pricing](../why-opensteward.md#no-per-call-pricing) |
| **CTO / VP Engineering** | One canonical schema across 1,548 platforms in 9 verticals. Zod-validated at every boundary. Adapter framework lets your team add anything we don't already ship. | [`docs/architecture/README.md`](../architecture/README.md) + [`docs/dev-api.md`](../dev-api.md) |
| **Platform / Engineering Lead** | Six Docker services, four SQLite files, one shared Dockerfile, ~110 000 tests. Operates like any other internal service. New adapter is days, not quarters. | [`CONTRIBUTING.md`](../../CONTRIBUTING.md) + [`docs/architecture/services.md`](../architecture/services.md) |
| **Procurement / Vendor Risk** | Source-available (Elastic-2.0 + Additional Use Grant). Internal deployment is unrestricted. No DPA to negotiate. No managed-service vendor in the chain. Worst-case fork option is real. | [`docs/why-opensteward.md` § Source-available freedoms](../why-opensteward.md#source-available-freedoms) + [`LICENSE`](../../LICENSE) |

---

## Before any conversation — the universal frame

There are two things you should be able to say in any room, in any order, regardless of who is sitting across from you. Anchor every meeting to these and you will spend less time defending and more time advancing.

**One — this is infrastructure you operate, not a vendor you trust.** OpenSteward is source-available code you deploy yourself. You deploy it inside your own VPC, behind your own IdP, with your own audit logs. There is no multi-tenant SaaS version. There is no third-party vendor in the customer-data path. Every claim about its behaviour is verifiable in the source tree your team already has access to. That single fact reframes every question that follows — security, compliance, procurement, TCO. The conversation stops being *"can we trust this vendor?"* and becomes *"can we run our own deployment of this code under our own controls?"* — and the second question is one your colleagues are actually equipped to answer.

**Two — read-only by default.** The standard API key your engineers will mint reads every vertical, manages customers, and consumes Connect Link consents — but cannot push writes back to upstream systems. Write capability is an explicit, scope-gated opt-in (`vertical:write`). The preset is defined in one file you can read in thirty seconds (`apps/admin/src/core/routes/api-keys-defaults.ts`). That single design choice is what makes the rest of the regulatory story honest: a read-only data fetcher running in your VPC does not put you into any regulated regime you were not already in.

Lead with those two sentences. Everything else in this document is detail underneath them.

---

## 1. CISO / Head of Security

**Who they are.** The person accountable for the organisation's security posture — whether they hold that title formally (CISO, VP Security, Director of InfoSec) or operate as the de facto owner in a smaller IT shop. Their day is incidents, audit findings, vendor security reviews, and the question *"is this going to be the thing that ends my career?"*

**What they care about.**
- The attack surface this adds, and whether it's contained inside their existing perimeter.
- Whether the system can be operated in a way their team already knows how to operate.
- Blast radius — if something inside OpenSteward is compromised, what gets to your customer data.
- AI tooling — whether the MCP server creates a new path for an LLM to exfiltrate sensitive data.

**The 90-second pitch.** "It's source-available code we deploy inside our VPC, behind our existing IdP, with our existing audit pipeline. Running it internally needs no commercial licence: a licence file, free to start and verified offline, sets how many connections it serves. No managed SaaS, no vendor backplane, no DPA — it sits next to our other internal services. The repo includes a security guide that maps the full attack surface, documents the hardening controls the platform ships with, and names the items left to the operator. AI agents that need read access to customer data go through a typed, read-only Model Context Protocol surface that *cannot* coexist with write scopes — your analysts get LLM tooling without us issuing them production database credentials."

**Objections you'll hear, and the honest answers.**

- *"Where's the third-party security audit?"*
  → We don't have one — and we don't claim one. What we have is a security guide with the full attack surface mapped out (every endpoint, every auth boundary, every risk rated and the control that addresses it). It's in [`docs/security/README.md`](../security/README.md). If your team wants to run their own pen-test, the playbook at the end is reproducible against a dev instance. We did the homework so your assessors don't start from zero.

- *"What's the blast radius if OpenSteward itself is compromised?"*
  → The credential store is AES-256-GCM-encrypted at rest with a key the operator controls. The container runs as a non-root user with a read-only rootfs (via the optional [`docker-compose.hardening.yml`](../../docker-compose.hardening.yml) overlay), no Linux capabilities, no new-privileges. The admin-api isn't exposed publicly — only the admin UI reaches it on an internal Docker network. Worst case: the attacker has whatever access the OAuth-token cache held, scoped to whatever customers had connected. Same blast-radius shape as any internal credential vault.

- *"Could the MCP server leak data to an external LLM?"*
  → MCP runs over stdio — there is no network listener. The LLM agent is local to the analyst's workstation; it pulls from OpenSteward with a tenant-scoped Bearer key the operator mints, and it can only call typed read tools. Scopes `mcp:read` cannot coexist on the same key with any `*:write` scope, enforced at mint time. The LLM might still leak through *its own* outbound network (that's a vendor-LLM question), but it cannot leak through OpenSteward's surface.

- *"What about CVEs in dependencies?"*
  → Dependabot is wired on `package.json`, the Dockerfile, and GitHub Actions. `pnpm audit --prod --audit-level=high` runs on every PR and on a weekly cron via [`.github/workflows/security-audit.yml`](../../.github/workflows/security-audit.yml). Current baseline is clean (zero high/critical). Stay on top of it the way you stay on top of any other repo your team owns.

- *"Will this be in scope for our SOC 2 / ISO 27001 audit?"*
  → Yes — it's infrastructure inside your environment, so your existing programme covers it the same way it covers any other internal service. We don't hold any third-party certifications and we don't claim any; your deployment's certification is yours to obtain under your own programme.

**What to put in front of them.**
- **§4 Posture by Category** in [`docs/security/README.md`](../security/README.md) — each risk with its location in code, the control that addresses it and a severity label, plus a **What remains open** list of what is still outstanding.
- The five-layer auth model in [`docs/architecture/auth-and-tenancy.md`](../architecture/auth-and-tenancy.md) — operators / admin users / dev keys / end-user tokens / connections.
- The container hardening overlay at [`docker-compose.hardening.yml`](../../docker-compose.hardening.yml) — every service drops cap_drop ALL, no-new-privileges, read-only rootfs.
- The pen-test playbook section near the end of `docs/security/README.md` — they can run it themselves.

**The single sentence to close with.**
"This goes through the same internal-service onboarding any of our other VPC-deployed tools does — no new vendor review, no new perimeter, and the threat model is already written down."

---

## 2. DPO / Head of Privacy

**Who they are.** The person accountable for personal-data processing — GDPR Article 37 in the EU/UK, the de facto privacy lead elsewhere. Their day is records of processing activities (RoPA), subject access requests, DPIAs, and the standing question *"are we creating a new processing activity we have to document?"*

**What they care about.**
- Whether this deployment creates a new processing record (and if so, what the lawful basis is).
- International transfers — does data leave the jurisdiction you've committed to?
- Right-to-erasure plumbing — when a customer asks to be forgotten, how does that propagate?
- Consent records — how clean is the audit trail when a regulator asks "who authorised this read?"

**The 90-second pitch.** "It changes the *transport* for personal data we already legally process; it does not change the *basis* on which we process it. The data classes we pull through it — invoices, contacts, shipments — are the same classes our applications already handle today through manual exports or vendor SFTP feeds. Our controller status, our existing lawful bases, and our existing DPIAs all extend cleanly. The one new artefact is a per-customer Connect Link consent record — which actually strengthens our audit trail because it ties every read to a time-bounded, signed authorisation. Data residency is solved by where we deploy: in-region binary, no vendor backplane reaching out of jurisdiction."

**Objections you'll hear, and the honest answers.**

- *"Does this create a new processing activity I have to add to our RoPA?"*
  → It modifies an existing one. The data classes (invoices, contacts, shipments, orders) and the purposes (claims pre-fill, underwriting, reconciliation) are the same as today. The transport changes from manual export to API; the basis (legitimate interest, contractual necessity, or consent) does not. Update the existing RoPA entries to reference the new transport — don't create new ones.

- *"What about international transfers? Are we adding a new third country to our processing chain?"*
  → No vendor backplane. Deploy the binary in whatever region you've committed to (EU, UK, Switzerland, Singapore, US, wherever). The data flows from the customer's SaaS directly to your VPC. The international-transfer question collapses to "where is the upstream SaaS hosted?" — which is the same question you already answered for each of those SaaS contracts.

- *"How do we propagate a right-to-erasure request?"*
  → A single call — `DELETE /v1/customers/:id?cascade=connections` (or the admin equivalent, `DELETE /admin/end-users/:id?cascade=connections`) — deletes the customer and every connection their links produced; the connection cascade drops cached resources, sync jobs, and external-account links automatically. The written runbook is [`docs/operations/data-erasure.md`](../operations/data-erasure.md), including the retention settings that age out webhook-payload residue. The upstream platform (Stripe, QuickBooks, Salesforce) holds the source-of-truth copy and keeps its OAuth grant until revoked at the source; your erasure obligation there is unchanged.

- *"What's the lawful basis for the Connect Link consent record?"*
  → Article 6(1)(a) explicit consent, evidenced by a time-bounded signed authorisation per customer per (vertical, platform). Or 6(1)(b) contractual necessity for cases where the customer-data access is required to perform a contract with the customer (lending decisions, premium financing). Pick whichever your existing privacy programme already uses for this data class.

- *"Will subject access requests be slower because of an extra system?"*
  → No. The data we cache is canonical-schema versions of upstream records. Subject access exports already pull from the upstream platforms; if you want to include the canonical cache, it's a single SQL query against the resource store. Faster, not slower, because the cache is structured.

**What to put in front of them.**
- The per-vertical regulatory map at [`docs/business-cases/README.md`](./README.md#what-rules-apply-to-the-data-we-read-per-vertical) — every privacy regime (GDPR, UK DPA, Swiss nFADP, CCPA/CPRA, PIPEDA, LGPD, APAC PDPAs) linked to its authoritative source.
- The [Connect Link](../architecture/connect-links.md) architecture page — the consent flow they'll be documenting in your privacy notice.
- The erasure runbook at [`docs/operations/data-erasure.md`](../operations/data-erasure.md) — the deletion-cascade calls and retention settings, ready to slot into your existing erasure workflow.
- The auth-and-tenancy doc's section on end-user tokens — the data-access scope you can grant a customer's own AI agent without giving it write capability.

**The single sentence to close with.**
"Same data, same legal basis, better audit trail — the privacy paperwork is updates to existing records, not new ones."

---

## 3. CCO / Head of Compliance

**Who they are.** The person accountable for the organisation's regulatory compliance — sometimes the same person as the DPO, more often a separate role in financial services and insurance. Their day is regulator correspondence, examiner findings, written information-security programmes, and the standing question *"is this going to show up in our next exam?"*

**What they care about.**
- Whether deploying this triggers a new regulated regime they have to manage.
- Whether it changes the answer to anything an examiner has already asked.
- Third-party-service-provider provisions in industry-specific rules (NAIC #672, GLBA, FFIEC) — does it count as a new TPSP?
- PCI scope, specifically — payments data is everyone's first question and rarely the right one.

**The 90-second pitch.** "It does not trigger a new regulatory regime for us to manage. PCI-DSS specifically is not in scope — our payment-vertical adapters read post-tokenisation data only, and full PANs never enter OpenSteward. SOX, GLBA, NAIC #672, FFIEC examiner expectations all apply to the data inside our existing perimeter exactly as they do today. Read-only by default; the moment we turn on write scopes for a specific use case, the regulatory analysis for *that* path extends — but the default deployment keeps us out of that conversation until we choose to enter it. The third-party-service-provider provisions in industry rules apply to the *upstream platforms* we're already contracted with, not to a self-hosted aggregation layer running in our VPC."

**Objections you'll hear, and the honest answers.**

- *"Is this in our PCI-DSS scope?"*
  → No. The payment adapters read post-tokenisation data from gateway APIs: `last4`, `brand`, `expiry`, gateway fingerprint, transaction history. None of those fields are cardholder data under PCI-DSS v4.0.1 — last-4 is explicitly defined as out of scope, and expiry / cardholder name / brand are CHD only when paired with a full PAN, which we don't have. Card capture and tokenisation happen at the processor (Stripe, Adyen, Worldpay) before any data reaches us. Your SAQ level is determined by your own checkout / billing path, separately from OpenSteward. The long-form analysis is in [`banks.md` § The regulatory boundary](./banks.md#the-regulatory-boundary--read-only-by-default-no-new-regimes).

- *"Does this count as a new third-party service provider under NAIC #672 / GLBA / FFIEC?"*
  → No. It is infrastructure operated inside our environment under our access controls and audit logs. The TPSP provisions apply to the upstream platforms (Stripe, Salesforce, QuickBooks, FedEx) we already have contracts with. OpenSteward sits *next to* those vendors in our diagram, not in front of them.

- *"What changes for our SOX / SOC 1 ICFR scope?"*
  → For read-only deployments, nothing — our financial reporting controls already cover the data classes flowing through. The moment we enable `vertical:write` on a key that posts to our accounting system, that write path extends into ICFR scope and we treat it the same way we'd treat any other automated journal-entry source.

- *"Will an examiner ask about this?"*
  → Probably, yes — and the answer is easier than it would be for a managed vendor. The data-flow diagram is in [`docs/architecture/README.md`](../architecture/README.md). The encryption-at-rest, access controls, and audit logs are documented in [`docs/security/README.md`](../security/README.md). Source is in the repository the examiner can read without an NDA.

- *"What about Solvency II / Pillar 2 governance documentation?"*
  → Same answer. The technology-stack documentation under Pillar 2 / ORSA gets easier when the integration layer is auditable source code in our own environment. The regime itself applies regardless of which integration vendor we use; what changes is the supporting documentation burden.

**What to put in front of them.**
- The per-vertical regulatory map at [`docs/business-cases/README.md`](./README.md#what-rules-apply-to-the-data-we-read-per-vertical) — every regime, linked to authoritative source, with the "already owned by" column naming the team in your shop that already has the obligation.
- The "**Triggered by OpenSteward?**" column in the [payments-vertical table](./README.md#payments-vertical) — answers the PCI question and its eight cousins in one scannable place.
- The "Quick reference" summary table near the top of the README — they can paste it into an exam-prep document verbatim.
- [`banks.md` § The regulatory boundary](./banks.md#the-regulatory-boundary--read-only-by-default-no-new-regimes) (or the insurance equivalent) — the regime-by-regime treatment in long form.

**The single sentence to close with.**
"No new regulated regime to manage; the regimes that already apply still apply, with a cleaner audit trail."

---

## 4. CFO / Controller

**Who they are.** The person accountable for the organisation's economics — typically the CFO or a deputy (Head of FP&A, Controller, VP Finance). Their day is budget reviews, vendor spend, build-vs-buy debates, and the standing question *"is this the cheapest way to get this outcome over a three-year horizon?"*

**What they care about.**
- Total cost of ownership over a multi-year horizon, including operations.
- How costs scale — per customer, per call, per region.
- Vendor concentration and contract risk.
- Build-vs-buy framing where "buy" is a managed integration platform.

**The 90-second pitch.** "Managed integration platforms (Merge, Apideck, Plaid, Fivetran) price per call, per connection, or per seat — costs scale with our usage *and* our customer base. OpenSteward runs on infrastructure we already pay for. Adding the thousandth customer to a self-hosted aggregation layer is a CPU and disk cost; adding the thousandth customer to a per-connection vendor is a per-connection fee. The breakeven point with most managed vendors is between 50 and 200 connected customers — past that, the self-hosted model is materially cheaper, and the curve only steepens. The trade you make is operational — somebody has to run it. For an organisation that already has an SRE / platform team running internal services, that cost is incremental, not new."

**Objections you'll hear, and the honest answers.**

- *"What's our TCO over three years versus a managed vendor?"*
  → The shape of the math: managed-vendor cost is roughly (per-connection-fee × active connections × months) plus per-call surcharges if you exceed a tier. OpenSteward cost is roughly (one or two pre-existing engineer-days of ops time per month) plus the infrastructure run-cost of a few small containers (call it a couple hundred dollars a month at typical SMB-vertical volumes). The crossover depends on the per-connection price you've been quoted; for the public price lists of the named vendors, the crossover is usually under 100 connections. We deliberately don't build a fake ROI calculator — your finance team should plug in our actual quote and our actual customer-base projection and see for yourself.

- *"What's our build-vs-buy framing here? This isn't 'buy' but it's not 'pure build' either."*
  → "Adopt-and-extend." We get the canonical schema, the OAuth orchestration, the encryption-at-rest credential store, the webhook delivery infrastructure, and 1,548 adapters as a starting point. We extend it where our customer mix requires platforms we don't see in the catalog today (NetSuite, Applied Epic, etc.). The framework is the build; the in-tree adapters are the buy.

- *"What happens if we scale to 10× the customer count?"*
  → No additional licence cost. Infrastructure cost goes up roughly linearly with sync volume, dominated by upstream API call rates (which we pay-per-call regardless of integration vendor). The Redis profile in `docker-compose.yml` adds horizontal scale for the rate-limit and admin layers. We've designed it for self-hosted scaling, so the 10× case is more memory and more replicas, not a vendor renegotiation.

- *"What's the people-cost — how many engineers will this actually take?"*
  → Day-one deployment is one platform engineer for a couple of days to wire it into our VPC, IdP, and observability. Day-two operations is part of an existing platform team's rotation — same on-call profile as any other internal Fastify + SQLite service. New adapters (when we need a platform not in the catalog) are days, not months, against the existing adapter interface. The full operations cost is what we already pay for one of our other internal services, not a new line item.

- *"What's our exit cost if we change our mind?"*
  → We can stop running it and shift the customer-data pulls back to whatever you're using today, or migrate to a managed vendor. The data is in our own SQLite store — exportable in standard formats. The OAuth tokens are revocable from our admin UI. There is no vendor we have to give notice to, no contract to wind down, no separation-services SOW.

**What to put in front of them.**
- [`docs/why-opensteward.md` § No per-call pricing](../why-opensteward.md#no-per-call-pricing) — the headline economic argument in 200 words.
- [`docs/why-opensteward.md` § When a managed platform is the better choice](../why-opensteward.md#when-a-managed-platform-is-the-better-choice) — the honest trade-off framing. CFOs respect docs that say *"sometimes the other answer is right."*
- The [Why OpenSteward entry on the root README](../../README.md) — the value-prop list a CFO can scan in two minutes.

**The single sentence to close with.**
"The breakeven happens early enough that we save money from year one; the upside is that the cost stops growing with our customer base."

---

## 5. CTO / VP Engineering

**Who they are.** The senior technology decision-maker — CTO, VP Engineering, Head of Platform. Their day is architecture reviews, hiring, vendor selection at the strategic level, and the standing question *"does this fit the technology direction we've committed to?"*

**What they care about.**
- Whether the technology choice fits their existing stack and skillset.
- Extensibility — what happens when their customer mix outgrows what's in the catalog.
- Whether they're locked into the vendor's schema or their own application can drive the shape.
- The maturity and review surface of the codebase they're adopting.

**The 90-second pitch.** "It's TypeScript-strict Fastify with Zod validation at every boundary and ~110 000 tests. One canonical schema over 1,548 adapters across 9 verticals — the same `invoice` / `contact` / `payout` shape regardless of upstream platform, with every platform-specific field preserved on the `metadata` field so nothing is lost. The adapter interface is typed; adding a new one against an existing vertical is a single directory's worth of work — auth, transforms, tests. The data plane is built on the assumption that the upstream platform changes and we need to absorb that change without disturbing downstream applications. It's the integration layer we'd have built ourselves; instead we're starting from a head-start version of it under a licence that puts no restriction on how we use it internally."

**Objections you'll hear, and the honest answers.**

- *"Are we locked into your canonical schema?"*
  → The schema lives in the repository, in your branch, defined as Zod schemas you can extend. Platform-specific fields are preserved on each canonical resource's `metadata` field, so nothing is filtered out. If you need a vertical-specific shape that doesn't exist today, you can add it the same way the project's own schemas were added. There is no vendor controlling the canonical definitions.

- *"What about platforms not in your catalog?"*
  → Adapter framework is the answer. Each vertical exposes a typed interface (`AccountingAdapter`, `CrmAdapter`, etc.). Implementing a new adapter is auth + transforms + tests against a stable interface — typically days for a well-documented platform API, not the months it would take to build from scratch. See [`docs/architecture/adapter-lifecycle.md`](../architecture/adapter-lifecycle.md) for the lifecycle and [`CONTRIBUTING.md`](../../CONTRIBUTING.md) for the workflow.

- *"How does this interact with our event-driven / streaming architecture?"*
  → Three modes ([`docs/dev-api.md § 7`](../dev-api.md#7-data-store-is_livetrue-and-sync)). `database` (default) caches canonical resources in SQLite; `passthrough` proxies every read live for apps that already have their own persistence; `external` fans signed `resource.*` events out via the existing webhook delivery infrastructure to your Kafka / Postgres / SQS / whatever. The integration-with-streaming question has a configuration answer, not a build answer.

- *"What's the long-term commitment from the maintainers?"*
  → Source-available under Elastic-2.0, public repository, commits visible in `git log`. If the upstream project stalls, you have your fork — the licence grants the perpetual right to use, modify, and distribute, and that right does not depend on the maintainer's cooperation. (Contributing code upstream does require signing a CLA; that's a contributor concern, not a deployment one.)

- *"Will our team learn anything transferable, or are we investing in vendor-specific knowledge?"*
  → TypeScript + Fastify + Zod + SQLite + OAuth + HMAC webhooks + canonical-schema design. Every one of those is a transferable skill. The vendor-specific bits are zero — there are no proprietary protocols, no vendor SDKs, no closed integrations.

**What to put in front of them.**
- [`docs/architecture/README.md`](../architecture/README.md) — the overview chart and Tier-2 chart index. Forty seconds to skim, fifteen minutes to drill.
- [`docs/dev-api.md`](../dev-api.md) — the developer-API walkthrough. End-to-end customer onboarding through Connect Link to a `GET /v1/{vertical}/{resource}` call.
- [`docs/why-opensteward.md § Extensibility`](../why-opensteward.md#extensibility) — the framing for new verticals and new adapters.
- The integration test count (~110 000) — they can run `pnpm -r test` themselves and see it pass.

**The single sentence to close with.**
"It's the integration layer we'd have built, except we get a working version of it on day one and we still control the shape."

---

## 6. Platform / Engineering Lead

**Who they are.** The senior engineer who will actually be on call for this service — typically the Director of Platform, Head of SRE, Engineering Lead, or the most senior staff engineer on whichever team inherits day-two operations. Their day is incident reviews, capacity planning, on-call rotations, and the standing question *"what does this actually look like at 2 AM?"*

**What they care about.**
- The shape of day-two operations — what services run, what stores, what the failure modes are.
- The on-call profile — what pages, what runbooks, how often.
- The integration cost — how it fits into existing CI/CD, observability, deploy pipelines.
- The bus-factor and contributor velocity of the upstream project.

**The 90-second pitch.** "Six containers in `docker-compose.yml` — admin UI, admin API, integration server, webhook gateway, docs server, optional Redis for shared rate-limit state. Four SQLite files holding credentials, admin records, webhook deliveries, and the resource cache. One shared Dockerfile parameterised by `APP=`. ~110 000 tests run on every PR. Standard healthchecks, structured Pino logs, optional OpenTelemetry, optional Redis for multi-replica. Operates like any of our other Fastify services — the on-call team picks it up after one session walking through the docs and one tabletop incident. New adapters against an existing vertical are days, not weeks; new verticals are weeks, not months. We're inheriting a maintained codebase, not adopting a research project."

**Objections you'll hear, and the honest answers.**

- *"What do we actually have to operate?"*
  → Five long-running services plus an optional Redis. [`docs/architecture/services.md`](../architecture/services.md) is the canonical inventory — ports, dependencies, databases, env vars. The integration server is the hot path; the others are lower-volume admin and ancillary surfaces. Failure modes are documented in the architecture pages, and the data plane degrades gracefully — if the resource cache is unavailable, requests fall through to live upstream calls.

- *"What's the on-call profile look like?"*
  → Same shape as any other Fastify + SQLite internal service. Healthcheck endpoints on every service, configurable rate limits, circuit breakers between the integration server and upstream platforms (so a flapping upstream doesn't take down our service). The most common 2 AM scenario is a customer's OAuth token expiring or upstream rate-limiting — both surfaced as structured log events and as `connection.authorization_expired` webhook events your existing incident-response pipeline can subscribe to.

- *"How many engineer-days for a new adapter?"*
  → Two to five for a well-documented upstream API with OAuth, more if the upstream API is shaped unusually. The adapter interface is small (auth + per-resource list/get/create/update/delete + transforms + tests). We've shipped over 1,500 already, so the patterns are well-trodden.

- *"What's the bus factor on the upstream project?"*
  → Source-available, all PRs in `git log`, contribution policy in [`CONTRIBUTING.md`](../../CONTRIBUTING.md). If the upstream pace doesn't match our needs, we fork or upstream-PR the adapters we care about. Upstreaming needs a CLA signature; forking needs nobody's permission. No vendor lockout either way.

- *"How does this fit our deployment pipeline?"*
  → It's a Docker build with an `APP` build arg. Wire it into whatever CI/CD you already use. Multi-stage build, ~150MB final images. No proprietary registries and no per-environment vendor accounts. The licence is a signed file you mount (a Secret in Helm), verified offline, so nothing phones home ([installing it](../deployment/license.md)). The hardening overlay ([`docker-compose.hardening.yml`](../../docker-compose.hardening.yml)) is the production-deploy template you can lift into your Helm / ECS / whatever.

- *"What about observability?"*
  → Pino structured logs to stdout — pick them up with whatever you already ship to Loki / Datadog / CloudWatch / ELK. Healthcheck endpoints on every service. Metrics surface is leaner than some vendors offer; if your team has invested heavily in OTel, that's an area you'd contribute to upstream rather than expect to find polished today.

**What to put in front of them.**
- [`docs/architecture/services.md`](../architecture/services.md) — the service-topology chart and inventory table.
- [`docs/architecture/persistence.md`](../architecture/persistence.md) — the ERD across the SQLite databases.
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md) — monorepo layout, pnpm workspaces, Turborepo, test patterns.
- [`docker-compose.hardening.yml`](../../docker-compose.hardening.yml) — the production deployment overlay they'd lift into their environment.
- The full test count in `apps/integration-server/tests/` — ~105 000 tests they can run themselves with `pnpm -r test`.

**The single sentence to close with.**
"It runs like any other Fastify internal service we already operate, and the codebase is one I'd hand a new staff hire on day one."

---

## 7. Procurement / Vendor Risk

**Who they are.** The function gatekeeping vendor onboarding — Procurement, Vendor Management, Sourcing, Third-Party Risk Management. Sometimes a dedicated team, sometimes a hat worn by Legal or the COO. Their day is vendor risk assessments, contract reviews, SLA negotiations, and the standing question *"if this vendor blows up, what's our exit?"*

**What they care about.**
- Contract terms — DPA, SLA, termination clauses, IP indemnity.
- Vendor financial health and continuity.
- Concentration risk — how reliant are we on this vendor?
- The audit and review packet — SOC 2 reports, ISO certificates, security questionnaires.

**The 90-second pitch.** "There is no vendor relationship to negotiate. This is source-available code we deploy ourselves; we are not contracting with an integration vendor, we are adopting a source-available project. The licence has one restriction — you can't resell it as a hosted integration service — and we are not doing that, so for our purposes it is unrestricted. There is no DPA — there is no third party processing our data. There is no SLA — we set our own internal SLA against our own deployment. There is no IP indemnity needed in a separate contract because the licence's patent grant is the indemnity. If the upstream project ever stops being maintained, we fork — that exit is a structural feature of the licence, not a worst-case scenario. The vendor-risk question is fundamentally different from your usual SaaS-vendor evaluation: there is no vendor to risk-assess."

**Objections you'll hear, and the honest answers.**

- *"Where's the DPA?"*
  → There isn't one because there's no third-party processor in the chain. We deploy the binary in our own VPC; customer data never touches the project maintainers' infrastructure. The DPA pattern is for SaaS vendors who *do* process customer data on the operator's behalf — OpenSteward's maintainers do not.

- *"Where's the SLA?"*
  → There isn't one in the SaaS-vendor sense because there's no service being delivered to us. We set our own internal SLA against our deployment, the same way we set internal SLAs against any other in-house service. The licence comes with an explicit "AS IS" warranty disclaimer — that's standard for both open-source and source-available software, and is the reason we set our own SLA rather than expecting one from upstream.

- *"What's our exposure if the project stops being maintained?"*
  → Worst case, our fork. The licence grants the perpetual right to use, modify, and distribute, and forking is explicitly permitted. We have the source tree, the test suite, the docs, and the git history. If the upstream project stalled tomorrow, we'd inherit it — and exercising that right needs nobody's sign-off. This is, in practice, much less risky than a managed-vendor outcome where bankruptcy or acquisition can terminate service overnight.

- *"What about IP indemnity?"*
  → The licence carries an express patent grant, which is the indemnity — no separate negotiation needed. This is one of the substantial advantages it shares with Apache-2.0 over MIT and BSD for enterprise use; MIT and BSD grant no patent rights at all.

- *"Where's the SOC 2 report?"*
  → There isn't one because there is no vendor whose controls we'd be auditing. The infrastructure runs in our environment under our SOC 2 — that's the audit that matters. We covered this in the security and compliance conversations; for procurement, the takeaway is that the absence of a vendor SOC 2 report is the structural feature of self-hosted open-source, not a gap to flag.

- *"What about a security questionnaire?"*
  → We can complete a self-attested security questionnaire about *our deployment*, the same way we would for any internal infrastructure component. The threat model, attack surface, and posture summary are in [`docs/security/README.md`](../security/README.md); the answers most security questionnaires want are documented there in advance.

- *"What's the financial health of the project maintainer?"*
  → Less material than for a SaaS vendor, and it's worth being precise about why. We don't depend on the maintainer for runtime — nothing phones home, and a deployment we already run keeps running regardless of what happens upstream. We depend on them only for *future* updates, which we could absorb in-tree if we had to. Be straightforward about who stands behind it: the project is owned and maintained by Falco Consulting AB, a small Swedish company, not a large vendor (see the `NOTICE` and `LICENSE` files). That is the honest answer, and for a self-hosted component it is also a *weaker* dependency than a SaaS contract with a well-capitalised supplier, because exercising the exit needs nobody's cooperation. If continuity is a hard procurement requirement, the fork right is the answer — we already hold every artifact needed to use it.

**What to put in front of them.**
- The [`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE) files — the actual contract surface.
- [`docs/why-opensteward.md § Source-available freedoms`](../why-opensteward.md#source-available-freedoms) — the procurement-relevant parts of the licence translated into plain English (commercial use, fork, embed, patent grant, and the single restriction).
- [`COMMERCIAL-LICENSE.md`](../../COMMERCIAL-LICENSE.md) — what the one restriction is, and why internal deployment never triggers it.
- [`docs/why-opensteward.md § Auditable source`](../why-opensteward.md#auditable-source) — the response to "how does this vendor handle our data?" without an NDA.
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md) and [`CLA.md`](../../CLA.md) — the contribution policy. Relevant only if your engineers upstream code; deploying and modifying OpenSteward in-house requires no agreement with anyone.
- [`docs/security/README.md`](../security/README.md) — the document a procurement officer can hand to their security questionnaire reviewer.

**The single sentence to close with.**
"There is no vendor contract to negotiate because there is no vendor — adoption is the same path we use for any other internal self-hosted dependency."

---

## The one-page recap

Print this. Stick it on your monitor before the meeting block.

| Stakeholder | Top concern | Pitch headline | One link |
|---|---|---|---|
| CISO | Attack surface + perimeter | "Every known risk mapped to a control or listed as open, no new vendor in our data path" | [`docs/security/README.md`](../security/README.md) |
| DPO | New processing activities + transfers | "Same data, same lawful basis, better consent audit trail" | [Per-vertical regulatory map](./README.md#what-rules-apply-to-the-data-we-read-per-vertical) |
| CCO | Regime triggers + TPSP status | "PCI not triggered, SOX / GLBA / NAIC unchanged perimeter" | [`banks.md` § Regulatory boundary](./banks.md#the-regulatory-boundary--read-only-by-default-no-new-regimes) |
| CFO | TCO + customer-base scaling | "Flat infrastructure cost, no per-call billing" | [`why-opensteward.md` § No per-call pricing](../why-opensteward.md#no-per-call-pricing) |
| CTO | Schema lock-in + extensibility | "Open canonical schema, typed adapter interface, ~110 000 tests" | [`docs/architecture/README.md`](../architecture/README.md) |
| Platform Lead | Day-two ops + on-call profile | "Six containers, ~110 000 tests, runs like any internal Fastify service" | [`docs/architecture/services.md`](../architecture/services.md) |
| Procurement | DPA / SLA / exit risk | "No vendor, no DPA, the fork right is the structural exit" | [`docs/why-opensteward.md` § Source-available freedoms](../why-opensteward.md#source-available-freedoms) |

---

## When the meeting goes sideways

A few patterns that come up across all seven conversations, and how to recover.

**"Show me a customer reference."** OpenSteward is source-available — the customer-reference convention from SaaS-vendor evaluation doesn't translate. The substitute is the source tree itself plus the public commit history, plus the doc set. If pressed, frame it as: *"We're not asking you to take a vendor's word for it — we're asking you to read the code your team will be operating."*

**"What about [thing we explicitly don't ship]?"** Every page in this section has a "What we don't ship" section because we'd rather you find out from us than from a procurement-stage surprise. If the missing capability is a hard requirement (Plaid, NetSuite, FHIR, a specific AMS), don't argue — say so, scope the work to build the adapter (or decide it's a wait), and treat the discussion as a planning exercise rather than a sales objection.

**"Can we get this on an enterprise contract instead?"** No — there is no enterprise SKU and there isn't going to be one. The honest answer is that the operational model is different from a managed-vendor model, and if that's a hard procurement gate, this might genuinely not be the right tool for the organisation today. The conversation is more productive when both sides know that early.

**"Who is responsible if something goes wrong?"** You are — the operator. That's the structural shape of self-hosted infrastructure. The trade is that nothing-goes-wrong scenarios cannot be caused by a vendor's outage, billing dispute, acquisition, or bankruptcy. Different risk surface, not zero risk.

---

## See also

- [Why OpenSteward](../why-opensteward.md) — the buyer-agnostic value props (use as the universal opener)
- [For banks](./banks.md) and [For insurance](./insurance.md) — industry-specific playbooks
- [Regulatory data map](./README.md#what-rules-apply-to-the-data-we-read-per-vertical) — per-vertical regime breakdown with authoritative links
- [Security report and hardening status](../security/README.md) — the document the CISO conversation runs off
- [Architecture overview](../architecture/README.md) — the chart the CTO and Platform Lead start from
- [Connect Links](../architecture/connect-links.md) — the consent flow the DPO will be documenting
- [Auth and tenancy](../architecture/auth-and-tenancy.md) — the five-layer auth model worth knowing before any CISO meeting
- [Developer Guide](../dev-api.md) — the technical onboarding path the engineering team will use
