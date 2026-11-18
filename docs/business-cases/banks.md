# For banks

> A banking-industry brief on what OpenSteward is, what it isn't, and where it earns its place inside a bank's IT estate. Skim the exec summary; the rest is for the technology operator who has to defend the choice to a CRO, a CISO, and a procurement team in the same meeting.

---

## Exec summary (90 seconds)

- **Read-only by default — no new regulatory regimes for your bank to manage.** The default API key reads every vertical but cannot push writes back to upstream systems. PCI-DSS is not triggered (we never see PANs). GDPR / GLBA / SOX apply to the data inside your existing perimeter, just as they already do. Write scopes are an explicit, audited opt-in.
- **Customer 360 across every payment and accounting platform your borrowers use.** One canonical schema over Stripe, Adyen, Worldpay, Square, Braintree, plus QuickBooks, Xero, Sage, Fortnox and the rest of the accounting catalog. The unified shape is the same regardless of which platform a particular borrower happens to run.
- **A consent flow that survives a regulator's read.** Connect Link is a tokenised hosted-OAuth flow that the borrower walks through in their own browser, on a page branded as your bank. The bank never sees the borrower's password; the auditor sees a clean, time-bounded authorisation record.
- **Internal AI agents on read-only customer data.** The included MCP server lets your risk, compliance, and ops analysts ask their own AI tooling questions like *which corporate customers had a chargeback-rate spike last week?* without you having to issue them production database credentials.
- **Zero per-call billing.** The economics are a server bill, not a per-customer subscription. The model that breaks at a hundred customers does not break at ten thousand.
- **Source-available, self-hosted, in your VPC.** No vendor in the data path. No third-party DPA. No telemetry, and the licence file is verified offline, so nothing phones home. No latency you can't observe.

If those points map to a roadmap line your team is already trying to fund, the rest of this page is the longer argument.

---

## The integration problem in banking

A modern bank's "core" is no longer where its customer data lives. Treasury, lending, risk, and compliance need to see across a fragmented SaaS landscape — the corporate customer who runs QuickBooks for books and Stripe for receivables and HubSpot for sales — and that fragmentation gets worse as the customer's tech stack matures. Your data team writes a one-off integration for every credit underwriting cycle; six months later the SaaS provider deprecates a field, the integration breaks, and a borrower's lending decision is held up because nobody noticed.

The market has answers for one slice of this. Plaid solved retail consumer-bank account aggregation. Merge and Apideck wrap business-SaaS APIs behind a paid proxy. None of them solve the *self-hosted, regulated-deployment* version of the problem. Banking IT teams have, by and large, two choices: build the canonical schema in-house (years of work, ongoing maintenance) or accept a managed vendor in the data path (and the DPA, audit, and contractual baggage that comes with it). OpenSteward is the third option: a canonical-schema integration aggregator you run yourself, source-available and free for exactly this use, with a deployment topology designed for regulated workloads.

---

## Use case 1 — Customer 360 for SMB lending

**The problem.** Your commercial-banking team underwrites a small business. The SBA package, the corporate credit application, the line-of-credit renewal — they all want the same set of inputs: revenue, AR aging, gross margin, settlement volume, customer concentration. Today that's a manual T-12 upload, a Plaid pull for the operating account, a screenshot of a QuickBooks dashboard, and a follow-up email asking for the last three Stripe payouts. The borrower's CFO does the work; your underwriter waits.

**What OpenSteward changes.** Your borrower runs the **Connect Link** flow once, in their own browser. They authorise read access to their accounting (QuickBooks, Xero, Sage Intacct, NetSuite-class systems where supported), their payment gateways (Stripe, Adyen, Worldpay, Braintree, Square, Authorize.Net), and optionally their CRM (Salesforce, HubSpot). From that moment, your underwriting platform reads canonical `invoice`, `payout`, `customer`, and `transaction` shapes — the same fields whether the borrower is on QuickBooks Online or Xero. The underwriter's model gets the same input shape across every borrower.

**The economic argument.** Underwriting cycle time drops because the data is current. The borrower doesn't re-submit when the application expires. The model trains on a wider, more current dataset because the cost of pulling the data went to zero on the marginal customer.

**The control argument.** Every read is logged, audit-trailed, and tied to the borrower's signed consent. Revocation is a single click in the bank's admin UI and propagates immediately. The bank's auditor can answer *"who saw what, when, under what authorisation?"* without filing a ticket with a vendor.

**Where OpenSteward fits in the stack.** It is the data-aggregation layer. Your decisioning model, your scoring engine, your lending platform of record — all unchanged. The only thing that changes is *the shape of the data flowing in*.

---

## Use case 2 — Reconciliation across payment gateways

**The problem.** A merchant-acquiring bank's reconciliation team chases settlement-file mismatches across half a dozen processors every morning. Stripe settles to one ledger account, Adyen to another, Worldpay to a third. The accounting team's general ledger expects one shape; the processors emit five. Every quarter, somebody writes a new Excel macro.

**What OpenSteward changes.** Settlement-style data from every payment vertical adapter lands in the canonical schema — same `payout`, `charge`, `refund`, and `fee` fields regardless of processor. Match those against canonical `invoice` and `journal_entry` records pulled from QuickBooks, Xero, Sage, or whichever accounting system the merchant uses. The match logic lives once in your reconciliation engine; new processors are configuration, not code.

**Caveat we want to be honest about.** NetSuite is the accounting platform most large merchants ask for and it is not in the current vertical catalog. If your reconciliation flow assumes NetSuite is on the supported list, you'll need to implement that one adapter against the existing accounting-adapter interface. The shape of the work is clear; the work itself is open.

---

## Use case 3 — Open-banking-adjacent, without Plaid lock-in

**The problem.** US retail consumer-banking aggregation has a winner: Plaid. For most teams that's fine. For some — non-US markets where Plaid coverage is thin, banks that don't want to put a single intermediary in the consumer-data path, banks negotiating direct data-share agreements with their own customers — Plaid is a constraint, not a solution.

**What OpenSteward changes.** OpenSteward handles the OAuth-orchestration, token-refresh, canonical-schema, and webhook-signature-verification layer for any platform you connect. It does **not** ship a Plaid-style consumer-bank aggregator (see "What we don't ship"). What it does ship is the infrastructure your team needs to bring in their *own* data-share agreements — direct connections to corporate-banking portals, regional aggregators (Tink in Europe, Akoya in the US institutional space, Salt Edge globally), or internal partner-bank feeds — and have those connections look the same to your downstream systems as a Stripe or QuickBooks connection does.

You bring the deals. The framework brings the shape.

---

## Use case 4 — Embedded finance and BaaS distribution

**The problem.** Banks that white-label financial products (corporate cards, working-capital lines, embedded-payments rails) to fintech partners have to give those partners visibility into the partner's own customer base. Today that's bespoke per-fintech integration work; six fintechs, six engineering teams, six contracts.

**What OpenSteward changes.** Mint a tenant-scoped API key per fintech partner. The partner uses Connect Link to onboard *its* customers' accounting + payments accounts into your platform. Your underwriting / risk / fraud teams see a unified view of every partner's customer base in the same canonical schema. Connect-Link **templates** let you pre-pick the vertical, platform, and scope set the partner is allowed to request — your security team sets the guardrails once, not per-deal.

The economic outcome is the same shape as a BaaS contract: more partners onboard for less marginal engineering effort.

---

## Use case 5 — Internal AI risk + compliance agents

**The problem.** Risk and compliance teams want to query the same kinds of cross-system questions analysts have always asked, with two twists: they want to ask them *in natural language* now (Claude, ChatGPT Enterprise, your in-house copilot), and the bank's CISO will not — under any circumstances — issue an LLM with raw production database credentials. The compromise so far has been to give the LLM stale, manually-exported CSVs.

**What OpenSteward changes.** The repository ships a Model Context Protocol (MCP) server that exposes the canonical schema as a typed, **read-only** tool surface. The bank's internal AI agents (Claude Desktop, Cursor, Continue, gemini-cli, custom MCP clients) point at it with a `tenant`-scoped token. The agent can call `list_invoices`, `get_customer`, `list_payouts` — but `*:write` scopes can't coexist on the same key, and the model literally cannot issue a write. Audit log, rate limit, and revocation are all the same primitives the human-API surface uses.

The risk analyst asks Claude *"which customers' Stripe chargeback rate exceeded their 12-week trailing mean by more than two standard deviations this week, sorted by tenure?"* and the model has the data to answer. The CISO sleeps because the model can read but cannot mutate, and because the tokens are minted per-analyst and rotate.

---

## The regulatory boundary — read-only by default, no new regimes

The most important sentence on this page: **OpenSteward is read-only by default, and reads data that already lives inside your bank's existing regulatory perimeter. It does not introduce new compliance regimes for you to manage.**

That is a precise claim, not a marketing slogan. Here is what it actually means:

**Read-only by default.** The standard mint preset for a developer API key omits `vertical:write`. A freshly-issued key reads every vertical, manages customers, and consumes Connect Link consents — but cannot push writes back to QuickBooks, Stripe, Salesforce, or any other upstream system. The operator has to *explicitly* mint a key with `vertical:write` to allow mutations. The default posture, end-to-end, is observe-not-mutate. The source of this preset is one file (`apps/admin/src/core/routes/api-keys-defaults.ts`) and your engineers can audit it before a single connection is wired.

**PCI-DSS — not triggered by OpenSteward.** Card capture, tokenisation, and PAN storage happen at the payment processor (Stripe, Adyen, Worldpay, Square, Braintree, etc.) before any data flows to us. Our payment adapters read only **post-tokenisation** representations: `last4`, `brand`, `expiry`, `fingerprint`, and the charge / payout / refund / dispute history. None of these fields are cardholder data under PCI-DSS v4.0.1 — last-4 is explicitly defined as out of scope, and expiry / cardholder name / brand are CHD only when paired with a full PAN, which we don't have. OpenSteward does not store, process, or transmit PANs, and is therefore not in scope for your PCI-DSS assessment. (Your application's own card-capture path, separately from us, is what determines your SAQ level.)

**GDPR, UK DPA, Swiss nFADP, state privacy laws — same perimeter.** The customer data we pull through Connect Link (invoices, contacts, transactions, shipments) is data your bank is already authorised to process under your existing legal basis with the borrower. We change the transport — from CFO-emailed spreadsheets to a canonical API — not the basis. Your controller status, processing-record obligations, and DPIA scope are unchanged. The new artefact is a Connect Link consent record per borrower, which actually *strengthens* your audit trail because it ties every read to a time-bounded, signed authorisation.

**SOX, GLBA, FFIEC examiner expectations — your existing scope.** These regimes apply to *you* as a financial institution. OpenSteward runs inside your VPC, under your access controls, with audit logs you own. It is infrastructure that supports your controls; it is not a new third-party service provider with its own SOC 2 you have to chase. The data-flow diagrams your examiner wants ("where does customer NPI live, who can read it, how is it encrypted, who has audit logs") all answer "inside our perimeter," with the answers documented in this repository, not behind an NDA.

**Important framing.** OpenSteward does not hold third-party certifications, and it does not need to. Your bank's existing PCI-DSS, SOC 2, ISO 27001, or equivalent programme already covers infrastructure you operate. When you deploy OpenSteward inside that perimeter, it inherits your controls; it does not require new ones.

When you *do* turn on write scopes for a specific use case (say, posting a journal entry back to QuickBooks for reconciliation automation), the regulatory analysis changes — you are now mutating a financial record upstream, and your SOX controls extend over that path. The default posture keeps you out of that conversation until you choose to enter it.

---

## Architecture pattern: how a bank deploys this

A typical regulated-bank deployment puts OpenSteward inside a private subnet behind the bank's existing reverse proxy and identity provider. The customer-data path stays inside the VPC. The admin UI is reachable only via SSO. The integration server's webhook gateway sits on a separate hostname that's allow-listed for inbound SaaS callbacks.

```
                                Customers' SaaS
                          (Stripe / QuickBooks / Salesforce)
                                       │
                                   OAuth + HMAC
                                       │
                ┌──────────────────────┴──────────────────────┐
                │              Bank VPC perimeter             │
                │                                             │
                │   Reverse proxy + IdP (Okta / Azure AD)     │
                │              │              │               │
                │     ┌────────▼───┐   ┌──────▼─────────┐     │
                │     │ Admin UI   │   │ Webhook gateway│     │
                │     │  :3000     │   │     :3004      │     │
                │     └────┬───────┘   └──────┬─────────┘     │
                │          │                  │               │
                │     ┌────▼──────────────────▼──────────┐    │
                │     │       integration-server         │    │
                │     │             :3010                │    │
                │     │ 1,548 adapters · canonical schema│    │
                │     └─────────────┬────────────────────┘    │
                │                   │                         │
                │     ┌─────────────▼──────────────┐          │
                │     │ Encrypted SQLite + Redis   │          │
                │     │ (per-bank-policy storage)  │          │
                │     └────────────────────────────┘          │
                └─────────────────────────────────────────────┘
                                       │
                            Your risk / lending /
                            compliance applications
```

The container-hardening overlay (`docker-compose.hardening.yml`) drops every capability, runs read-only filesystems, and removes the admin-api port from the public network. The security model is documented end-to-end in [`docs/security/README.md`](../security/README.md) — the security report documents 22 findings; 19 are mitigated and the three open items (two medium, one low) are named.

---

## What we don't ship

A regulated operator should know the gaps before they commit. We will not pretend they aren't there.

- **No Plaid adapter.** If your use case requires US retail consumer-bank account aggregation, you still need Plaid, MX, Yodlee, or Finicity. OpenSteward's footprint is the business-side SaaS layer (accounting, payments, CRM, commerce, logistics), not the consumer-bank-account data layer. Bank-internal direct data-share agreements can be wired in as adapters, but it is work you'll do, not work shipped today.
- **No NetSuite adapter** in the current catalog. QuickBooks, Xero, Sage (Intacct, Business Cloud, 50/100), Fortnox, and roughly two hundred and seventy-five others are covered. NetSuite is not in the catalog; if it's non-negotiable for your use case, plan to implement the adapter against the accounting-adapter interface.
- **No banking-as-a-service framework.** OpenSteward is not a BaaS provider. It sits alongside Treasury, Unit, Synctera, Bond, and similar providers — it does not replace them. If your roadmap line is "ship a fintech-issued debit card," this isn't the project; if it's "see every fintech-customer's accounting books," it is.
- **No KYC, AML, sanctions, PEP-screening services.** Adjacent to where the data lands, but out of scope. Persona, Alloy, ComplyAdvantage, Refinitiv World-Check are the names your compliance team already knows.
- **No SOC 2 / PCI-DSS / ISO 27001 / FedRAMP certifications held by OpenSteward itself.** The project gives you a deployment topology where you can obtain *your* certifications. The certifications are yours to obtain.
- **No managed-service tier.** You run it yourself. There is no "OpenSteward Cloud" offering, no per-tenant hosting, no support contract. If your operations team isn't staffed for a self-hosted SaaS-aggregation layer, that is a real cost to weigh — see the [trade-off summary](../why-opensteward.md#when-a-managed-platform-is-the-better-choice).

We are saying these things so a CTO can budget around them, not as a sales evasion.

---

## Getting started for a banking evaluation

Three concrete steps a banking platform team can take this week.

1. **Stand up the full stack on a laptop.** `git clone`, `docker compose up`. The integration server, admin UI, docs server, and webhook gateway are running locally inside five minutes. No telemetry leaves the laptop. No licence is needed yet: without one, OpenSteward runs in community mode, with one connection.
2. **Connect one Stripe sandbox + one QuickBooks Online sandbox.** The second connection needs a licence: a free one from [opensteward.dev/license](https://opensteward.dev/license) covers it ([installing it](../deployment/license.md)). Use the admin UI's Connect Link flow exactly as a borrower would. Verify that the canonical `invoice`, `payout`, and `customer` shapes match what your downstream systems expect. If something doesn't fit, the canonical schema is in `apps/integration-server/src/verticals/<vertical>/schema/` — readable, reviewable, modifiable.
3. **Audit the security posture.** Read [`docs/security/README.md`](../security/README.md). Run the pen-test playbook at the bottom of the report against your dev instance. Compare the mitigation status against your own checklist. If a finding worries your CISO, file it as an issue against the repo.

If those three days convince the platform team and the security team, the next conversation is with your platform group about VPC deployment patterns, not with another integration vendor.

---

## See also

- [Why OpenSteward](../why-opensteward.md) — the industry-agnostic value props
- [Security report + hardening status](../security/README.md) — what's mitigated, what remains
- [Auth and tenancy](../architecture/auth-and-tenancy.md) — the five-layer auth model your CISO will ask about
- [Connect Links](../architecture/connect-links.md) — the hosted-consent flow described above
- [MCP for AI agents](../mcp.md) — the read-only AI tooling surface
- [Container hardening overlay](../../docker-compose.hardening.yml) — the production deployment overlay referenced in the architecture diagram
