# For insurance carriers and brokers

> An insurance-industry brief on what OpenSteward is, what it isn't, and where it earns its place inside a carrier or broker's IT estate. Exec summary first; the rest is for the technology operator who has to defend the choice to a CRO, a CCO, and a procurement team in the same conversation.

---

## Exec summary (90 seconds)

- **Read-only by default — no new regulatory regimes for your carrier or agency to manage.** The default API key reads every vertical but cannot push writes back to a policyholder's or broker's upstream systems. State DOI data-handling, GDPR / UK DPA, and NAIC Model #672 apply to the data inside your existing perimeter exactly as they already do. Write scopes are an explicit, audited opt-in.
- **Pre-fill claims and underwriting from your policyholders' own data, with their consent.** Read the books of record they already maintain — accounting (QuickBooks, Xero, Sage), commerce (Shopify, BigCommerce, WooCommerce), logistics (FedEx, DHL, EasyPost) — directly into a canonical schema. The same shape, regardless of which platform a policyholder happens to run.
- **Underwrite SMB premium financing without the manual T-12.** Pull revenue, AR aging, gross margin, and customer concentration from a small-business policyholder's accounting system, with their consent, into your decisioning model. The borrower's CFO doesn't re-key the data; the underwriting cycle compresses.
- **Broker roll-ups across Salesforce + HubSpot in one canonical shape.** Carriers with broker networks running different CRMs no longer write per-broker import scripts. One canonical `contact`, `account`, `deal` shape; brokers connect their own tools via Connect Link; your aggregation dashboard reads from one place.
- **AI underwriter and claims copilots on read-only data.** The included MCP server gives Claude / Cursor / gemini-cli read-only access to the canonical schema. Your underwriting and claims teams ask their own AI tooling questions about a policyholder's connected data — the AI cannot mutate, your CISO is calm.
- **Source-available, self-hosted, in your VPC.** No customer data through a vendor proxy. No DPA you can't audit. No telemetry, and the licence file is verified offline, so nothing phones home. No regional-data-residency surprises.

If even two of those map to roadmap items your team is trying to fund, the rest of this page is for you.

---

## The integration problem in insurance

Insurance technology has a long-running data-integration backlog. Three patterns recur:

**Claims-handling teams spend their day re-keying.** A first notice of loss arrives. The policyholder has invoices in QuickBooks, shipping records in FedEx, point-of-sale data in Shopify — exactly the records an adjuster needs to verify the loss. The adjuster emails the policyholder to ask for them; the policyholder forwards screenshots; the adjuster re-keys them into the claims system. The cycle time is measured in days when it could be measured in minutes.

**Brokers and carriers see different shapes of the same customer.** A broker manages a book in Salesforce. Another runs Applied Epic. A third uses HubSpot for sales and a custom Access database for policy admin. The carrier's roll-up team writes per-broker ETL jobs, all of which break the first time the broker upgrades their tooling. The carrier's account view is six weeks stale.

**Premium-financing underwriting is gated by the borrower's CFO calendar.** A small business policyholder wants to finance a $40k commercial-property premium. The premium-finance lender wants twelve months of P&L, AR aging, and customer concentration. The CFO does the work manually. The deal slips a week.

The common thread: the data exists, but it lives in the policyholder's or broker's tooling, and getting it into the carrier's systems is bespoke per-policyholder, per-broker, per-renewal. OpenSteward is the canonical-schema aggregation layer that takes that work off your IT team's plate.

---

## Use case 1 — Claims pre-fill from policyholder records

**The problem.** A commercial-lines policyholder reports a loss. The adjuster needs revenue history, shipping data for the affected period, customer-impact analysis. Today, that's a back-and-forth email chain: "please send last six months of POS data," "please export your shipping report from FedEx," "please attach your Shopify orders for the dates of the outage." Adjuster productivity is gated by the policyholder's response time. Claim cycle time is measured in days for what should be a one-hour exercise.

**What OpenSteward changes.** At policy bind, the policyholder runs the **Connect Link** flow once, with read-only scopes for the systems your claims team will need to consult. From that point, the FNOL form pre-fills with last-N-months canonical data from the policyholder's books. The adjuster opens a claim and the relevant invoices, orders, shipments, and refunds are already attached.

**The business outcome.** Lower loss-adjustment expense per claim. Higher CSAT because the policyholder isn't emailing screenshots for a week. Faster reserve-setting because the data your actuaries need is already structured.

**The control outcome.** Every pull is logged and tied to the policyholder's signed authorisation. The policyholder can revoke at policy expiry from your portal. Auditor questions like *"why did we pull this customer's Shopify orders on this date?"* have an answer attached to a consent record.

**Where it fits in the stack.** OpenSteward is the data-aggregation layer. Your claims management system (Duck Creek Claims, Guidewire ClaimCenter, Majesco, Origami, etc.) stays where it is. The only thing that changes is *what shape of data the adjuster sees in the FNOL screen*.

---

## Use case 2 — SMB premium-financing underwriting

**The problem.** A small business needs to finance an annual commercial-lines premium. The premium-financing lender wants T-12 revenue, AR aging buckets, gross-margin trend, customer-concentration. The borrower's CFO is the bottleneck. The application sits for a week while she exports reports from QuickBooks.

**What OpenSteward changes.** The borrower authorises read access to their accounting system through Connect Link. Your decisioning model pulls the same canonical `invoice`, `payment`, `customer`, `journal_entry` shapes regardless of whether the borrower is on QuickBooks Online, Xero, Sage Intacct, or Fortnox. The underwriting flow runs in minutes, not days.

**The compounding outcome.** The decision is current — not based on the CFO's last manual export. The same data feed informs the renewal decision twelve months later. The model trains on a wider, fresher dataset because the marginal cost of pulling another borrower's books went to zero.

**Caveat.** NetSuite is the accounting platform most mid-market SMBs ask about, and it is not in the current vertical catalog. If your premium-financing book skews mid-market and NetSuite is non-negotiable, note that NetSuite is not in the current vertical catalog — see "What we don't ship."

---

## Use case 3 — Broker dashboards across Salesforce + HubSpot

**The problem.** A carrier has eight hundred independent agencies in its broker network. Two hundred use Salesforce Financial Services Cloud. A hundred and fifty are on HubSpot. The remainder are on AMS360, Applied Epic, EZLynx, custom builds. Your roll-up dashboard team writes a different importer for each system. The carrier's view of new-business pipeline is forever six weeks behind reality.

**What OpenSteward changes.** Salesforce and HubSpot are first-class CRM adapters with canonical `contact`, `account`, `deal`, and `note` schemas. Brokers in your network connect their own CRM through Connect Link once, with read scopes you pre-defined in a **Connect Link template**. Your aggregation dashboard reads from one canonical schema; the broker's CRM choice stops being your problem.

**The business outcome.** Broker onboarding to your carrier's network is faster because the data integration is a Connect Link, not a six-week IT project. Real-time visibility into the broker network's pipeline. New brokers can be productive on your carrier's products in days, not quarters.

**Honest scope.** Agency-management systems specific to insurance (Applied Epic, EZLynx, AMS360, Vertafore) are not currently in the CRM vertical. We ship the general-purpose CRM adapters (Salesforce, HubSpot, Pipedrive, Close, Zoho CRM, ~147 others). For insurance-specific AMS systems you'll want a separate integration; the framework is there to add it, the work is not yet done.

---

## Use case 4 — Embedded insurance for ecommerce and logistics

**The problem.** Embedded insurance is the fastest-growing distribution channel in personal lines. Shipping protection on Shopify checkouts, returns coverage on Amazon FBA flows, appliance warranties on direct-to-consumer brand sites — every embedded program needs a real-time data feed from the merchant. Building those feeds platform-by-platform is the work that gates carrier participation.

**What OpenSteward changes.** The ecommerce vertical covers 176 platforms (Shopify, BigCommerce, WooCommerce, Magento, PrestaShop, Salesforce Commerce Cloud, Wix, Squarespace, and the rest). The logistics vertical adds another 320 (FedEx, UPS, DHL, EasyPost, Shippo, ShipStation, every regional carrier worth integrating). Canonical `order`, `product`, `shipment`, `tracking_event` shapes — same across every platform.

**The carrier outcome.** Launching a new embedded program on a new ecommerce platform is a configuration change, not an engineering project. The same actuarial models read the same shapes. The same fraud rules apply. New geographic markets open up as you add regional ecommerce platforms to the catalog.

---

## Use case 5 — AI underwriter and claims-handler copilots

**The problem.** Underwriting and claims teams want LLM tooling to help them work faster, and the carrier's CISO will not authorise giving the LLM raw production credentials. The compromise so far has been stale CSV exports.

**What OpenSteward changes.** The Model Context Protocol (MCP) server in the repository exposes the canonical schema as a typed **read-only** tool surface. Underwriting analysts point their Claude Desktop or Cursor instance at it with a `tenant`-scoped token. Claims handlers point their internal copilot at it. Customer-facing chat (a policyholder asking *"what's the status of my claim?"* through the carrier's mobile app) uses **end-user mode** — the same MCP server, scoped to that policyholder's connections only.

The constraint is enforced in the auth layer, not by convention: `mcp:read` scope cannot coexist with any `*:write` scope on the same key. The model literally cannot issue a write. Audit log, rate limit, revocation are all standard primitives.

The underwriting director asks Claude *"which renewal candidates this month had Shopify GMV drop more than 30% quarter-over-quarter?"* and gets a list, with the model citing canonical-data evidence the carrier can validate against the connected system. The CISO doesn't issue a single new production credential.

---

## The regulatory boundary — read-only by default, no new regimes

The most important sentence on this page: **OpenSteward is read-only by default, and reads data that already lives inside your carrier's existing regulatory perimeter. It does not introduce new compliance regimes for your CISO or DPO to manage.**

That is a precise claim, not a marketing slogan. Here is what it actually means in the insurance context:

**Read-only by default.** The standard mint preset for a developer API key omits `vertical:write`. A freshly-issued key reads every vertical, manages customers, and consumes Connect Link consents — but cannot push writes back to a policyholder's QuickBooks, a broker's Salesforce, a merchant's Shopify, or any other upstream system. The operator has to *explicitly* mint a key with `vertical:write` to allow mutations. The default posture, end-to-end, is observe-not-mutate. The source of this preset is one file (`apps/admin/src/core/routes/api-keys-defaults.ts`) and your engineers can audit it before a single connection is wired.

**State Department of Insurance regulations and NAIC Model #672 — your existing scope.** US state DOI data-security requirements (and NAIC Model #672 in the states that have adopted it) apply to *you* as a regulated insurance entity. OpenSteward runs inside your environment, under your access controls, with audit logs you own. The "third-party service provider" oversight provision in Model #672 applies to the *upstream platforms* (Stripe, Salesforce, etc.) you're already contracted with — OpenSteward is not a new third party. It is infrastructure your IT team operates.

**HIPAA — not in scope as shipped.** No FHIR / HL7 / health-data adapters exist in the current catalog. Standard accounting / CRM / commerce / logistics flows do not carry PHI. If a future deployment wires OpenSteward to a HIPAA-relevant adapter (the framework supports adding one, the work isn't done), the BAA conversation is between you and your covered-entity policyholders — the technology supports the controls, but does not itself become a Business Associate.

**GDPR, UK DPA, Swiss nFADP — same perimeter.** The customer data you pull through Connect Link (invoices, contacts, orders, shipments) is data your carrier or agency is already authorised to process under your existing legal basis with the policyholder or broker. We change the transport — from emailed PDFs to a canonical API — not the basis. Your controller status, processing-record obligations, and DPIA scope are unchanged. The new artefact is a Connect Link consent record per policyholder, which actually *strengthens* your audit trail because it ties every read to a time-bounded, signed authorisation.

**PCI-DSS — not triggered.** If you're using payment-vertical adapters (Stripe, Adyen, Worldpay, etc.) for premium-collection reconciliation, the adapters read post-tokenisation data only: `last4`, `brand`, `expiry`, `fingerprint`, transaction history. Full PANs never enter OpenSteward. PCI-DSS scope is determined by your own checkout / billing path, separately from us.

**Solvency II, ORSA, and equivalent regimes.** For European, UK, and Bermuda-domiciled carriers, the governance documentation under Pillar 2 / ORSA gets easier when the integration layer is auditable source code running inside your own environment — but the regime itself applies to you regardless of which integration vendor you use.

**Important framing.** OpenSteward does not hold third-party certifications, and it does not need to. Your carrier's existing programme already covers infrastructure you operate. When you deploy OpenSteward inside that perimeter, it inherits your controls; it does not require new ones.

When you *do* turn on write scopes for a specific use case (say, posting a claim status update back to a broker's Salesforce, or writing a renewal record to a policyholder's QuickBooks for premium-financing reconciliation), the regulatory analysis changes — you are now mutating a record upstream, and your data-handling controls extend over that path. The default posture keeps you out of that conversation until you choose to enter it.

---

## Architecture pattern: how a carrier deploys this

The typical regulated-carrier deployment has OpenSteward running inside a private subnet behind the carrier's existing reverse proxy and IdP. Brokers and policyholders connect via Connect Link from their own browsers; the carrier's internal applications (claims, underwriting, broker portal, analytics) read from the integration server inside the perimeter.

```
                          Policyholders' SaaS              Brokers' CRMs
                       (QuickBooks / Shopify /         (Salesforce / HubSpot /
                          FedEx / Stripe)              Pipedrive / Applied …)
                                  │                              │
                              OAuth + HMAC                  OAuth + HMAC
                                  └──────────────┬───────────────┘
                                                 │
                ┌────────────────────────────────┴────────────────────────────┐
                │                    Carrier VPC perimeter                    │
                │                                                             │
                │       Reverse proxy + IdP (Okta / Azure AD / Ping)          │
                │              │                  │                 │         │
                │     ┌────────▼────┐   ┌─────────▼──────┐  ┌───────▼────┐    │
                │     │ Admin UI    │   │ Connect Link UI│  │ Webhook GW │    │
                │     │    :3000    │   │ (hosted OAuth) │  │   :3004    │    │
                │     └─────┬───────┘   └────────┬───────┘  └──────┬─────┘    │
                │           │                    │                 │          │
                │     ┌─────▼────────────────────▼─────────────────▼───┐      │
                │     │           integration-server :3010             │      │
                │     │      1,548 adapters · canonical schema         │      │
                │     │       MCP read-only surface (stdio)            │      │
                │     └────────────────────────┬───────────────────────┘      │
                │                              │                              │
                │     ┌────────────────────────▼─────────────────────────┐    │
                │     │  Encrypted SQLite + Redis (rate-limit, sessions) │    │
                │     └──────────────────────────────────────────────────┘    │
                │                              │                              │
                │     ┌────────────────────────▼─────────────────────────┐    │
                │     │   Carrier applications (Duck Creek / Guidewire   │    │
                │     │   ClaimCenter / Origami / underwriting models)   │    │
                │     └──────────────────────────────────────────────────┘    │
                └─────────────────────────────────────────────────────────────┘
                              │
                  Carrier's internal AI copilots
                  (Claude / Cursor / custom MCP clients)
                  via tenant-mode MCP server (read-only)
```

The container-hardening overlay (`docker-compose.hardening.yml`) drops every capability, runs read-only filesystems, removes the admin-api port from the public network, and forces non-root execution. The security model is documented in [`docs/security/README.md`](../security/README.md) — the security report documents 22 findings; 19 are mitigated and the remaining two medium and one low items are named.

---

## What we don't ship

A regulated operator needs the gaps named before the deployment decision, not after.

- **No insurance-specific verticals.** OpenSteward is the data-aggregation layer. It does **not** include claims adjudication, policy administration, rating engines, FNOL workflow, or policy issuance. Your core systems — Duck Creek, Guidewire, Majesco, Origami, BriteCore, EIS — stay where they are. OpenSteward feeds them; it does not replace them.
- **No insurance-specific CRM / AMS integrations.** Applied Epic, EZLynx, AMS360, Vertafore, NowCerts, HawkSoft are not in the current CRM vertical. We ship the general-purpose CRM platforms (Salesforce, HubSpot, Pipedrive, Close, Zoho, and ~147 others). Insurance-specific AMS adapters are within the framework's reach, but they are not yet written.
- **No FHIR / HL7 / health-data adapters.** Healthcare-adjacent insurance flows (group health, dental, long-term-care, supplemental) still need a separate HL7-FHIR stack (Redox, Particle Health, Health Gorilla, 1upHealth). OpenSteward does not enter that data plane.
- **No e-signature, no document AI, no IDP.** Adobe Sign, DocuSign, Hyperscience-class document parsers, OCR pipelines — adjacent to the integration layer, out of scope.
- **No telematics-data adapters in the auto/commercial-fleet sense.** Geotab, Samsara, Verizon Connect, Cambridge Mobile Telematics are not in the current logistics catalog (we ship freight-carrier APIs: FedEx, UPS, DHL, EasyPost, regional carriers). Telematics-based insurance — UBI, fleet safety, commercial-auto risk scoring — would require additional adapters.
- **No SOC 2 / HIPAA / ISO 27001 / NAIC Model #672 certifications held by OpenSteward itself.** The project enables your certification work; it does not perform it for you. Your deployment is your scope.
- **No managed-service tier.** You run it yourself in your own infrastructure. If the operations cost of a self-hosted SaaS-aggregation layer doesn't fit your IT model, see the [trade-off summary](../why-opensteward.md#when-a-managed-platform-is-the-better-choice).
- **Coverage gaps in some regional markets.** Asian-Pacific carrier-management systems, certain LATAM accounting platforms, and Indian-subcontinent SMB tooling are under-represented in the current catalog. The framework supports adding them; the work isn't done.

We say these things up front so a CTO can budget around them, not so a sales conversation can finesse them later.

---

## Getting started for an insurance evaluation

Three concrete steps an insurance-carrier or broker IT team can take this week. No sales call required, no telemetry. Step 1 needs no licence; the second connection in step 2 does, and a free one from [opensteward.dev/license](https://opensteward.dev/license) covers it ([installing it](../deployment/license.md)).

1. **Stand up the full stack locally.** `git clone`, `docker compose up`. Five minutes later you have the admin UI, integration server, docs server, and webhook gateway running on a laptop. Inspect every container, every config file, every dependency.
2. **Wire one Salesforce sandbox plus one QuickBooks Online sandbox.** Use Connect Link exactly as a broker or policyholder would. Verify that the canonical `contact`, `account`, `invoice`, and `payment` shapes match what your downstream claims and underwriting systems already expect. If the canonical schema doesn't match, it's in `apps/integration-server/src/verticals/<vertical>/schema/` — open source, modifiable, versionable.
3. **Audit the security posture.** Read [`docs/security/README.md`](../security/README.md). Run the pen-test playbook against your dev instance. Cross-reference the mitigation status against your own NAIC #672, GLBA, or SOC 2 internal checklists. If a remaining finding worries your CISO, file an issue.

If those three days convince the platform team and the security team, the next conversation is about VPC deployment patterns inside your environment, not about another vendor in your data path.

---

## See also

- [Why OpenSteward](../why-opensteward.md) — the industry-agnostic value props
- [Security report + hardening status](../security/README.md) — what's mitigated, what remains
- [Auth and tenancy](../architecture/auth-and-tenancy.md) — the five-layer auth model your CISO will ask about
- [Connect Links](../architecture/connect-links.md) — the hosted-consent flow that drives policyholder + broker onboarding
- [MCP for AI agents](../mcp.md) — the read-only AI tooling surface for underwriters, adjusters, and customer chat
- [Container hardening overlay](../../docker-compose.hardening.yml) — the production deployment overlay referenced in the architecture diagram
