# Industry playbooks

> OpenSteward is built to be the integration layer regulated companies own rather than rent. These pages translate that into the language of two industries that pay the highest price for getting integration wrong: banking and insurance.

> **Internal champion?** If you're the staff engineer or platform lead who has already decided this is the right call, skip to [**Selling OpenSteward inside your organisation**](./selling-internally.md) — a per-stakeholder cheat sheet for the seven conversations you're about to have (CISO, DPO, CCO, CFO, CTO, Platform Lead, Procurement).

## The headline for a regulated operator

**OpenSteward is read-only by default. It runs inside your regulatory perimeter; it does not expand it.**

The default API key your engineers mint is scoped to read every vertical, manage customers, and accept Connect Link consent — but **cannot push writes back to upstream systems**. To enable a write, an operator has to explicitly add the `vertical:write` scope to a key. That single design choice is what makes the regulatory story below honest: a read-only data fetcher does not, by itself, put you into any regulated regime you were not already in.

Specifically:

- **PCI-DSS — not triggered.** Our payment adapters read post-tokenisation data from gateway APIs (Stripe, Adyen, Worldpay, etc.). Full PANs never enter OpenSteward; the canonical schema captures `last4`, `brand`, `expiry`, and a gateway fingerprint, none of which is cardholder data under PCI-DSS. Your application's own card-capture path determines your SAQ level, separately from us.
- **GDPR / UK DPA / Swiss nFADP / state privacy laws — unchanged perimeter.** The customer data we fetch (invoices, contacts, shipments) is data your application is already authorised to process. The transport changes from manual exports to a canonical API; the legal basis, controller status, and processing record obligations do not.
- **HIPAA — not in scope as shipped.** No FHIR / HL7 / health-data adapters exist in the current catalog. Standard accounting / CRM / commerce / logistics flows do not carry PHI.
- **SOX, GLBA, NAIC #672, Solvency II — operator's existing scope.** These apply to *you* as a regulated entity. OpenSteward is infrastructure inside your environment that supports your controls; it does not introduce new third-party processors to your perimeter.

If you've landed here from a vendor short-list, those four points are the core compliance claim. The rest of this page is the operator FAQ.

---

## Quick reference — what governs each vertical, and what changes for you

A scannable one-line-per-vertical summary. Regimes are grouped by jurisdiction inside each row using bracket tags (`[EU]`, `[US]`, `[UK]`, etc.) so a reader can browser-find (`Ctrl+F` / `Cmd+F`) a tag and jump straight to every jurisdiction-specific regime on the page. Full text and authoritative links for every regime are in [**§ What rules apply to the data we read, per vertical**](#what-rules-apply-to-the-data-we-read-per-vertical) below.

| Vertical | Data we read | Primary regimes that already govern this data (tagged by jurisdiction) | Net new regulatory exposure from OpenSteward? |
|---|---|---|---|
| **Accounting** | Invoices, GL, AR / AP, tax records, vendors, customers | `[US]` SOX § 404, SOC 1 ICFR, IRS § 6001 retention, GLBA<br>`[EU]` GDPR, VAT OSS<br>`[UK]` UK DPA 2018, HMRC retention<br>`[CH]` Swiss nFADP<br>`[SE]` Skatteverket retention<br>`[Global]` US GAAP, IFRS<br>`[US-states]` sales-tax (varies); `[UK]` / `[AU]` / `[NZ]` / `[SG]` / `[IN]` GST | **None** — read-only by default; same data your finance team already processes |
| **CRM** | Contacts, deals, activities, notes (highest PII density) | `[EU]` GDPR<br>`[UK]` UK DPA 2018<br>`[CH]` Swiss nFADP<br>`[US-CA]` CCPA / CPRA<br>`[CA]` PIPEDA, CASL<br>`[BR]` LGPD<br>`[SG]` PDPA Singapore<br>`[TH]` PDPA Thailand<br>`[MY]` PDPA Malaysia<br>`[US]` TCPA, CAN-SPAM, FINRA Rule 4511, SEC 17a-4, HIPAA (only if PHI present) | **None** — read-only by default; same data your CRM users already process |
| **Ecommerce** | Orders, products, customers, fulfilments, addresses | `[EU]` GDPR, EU UCPD, VAT OSS / IOSS, GDPR Art. 33 breach notification, PSD2 SCA (checkout — upstream)<br>`[UK]` UK DPA, CMA, UK ICO breach notification<br>`[US]` FTC, COPPA, FDA / ITAR / EAR (restricted goods)<br>`[US-CA]` CCPA / CPRA<br>`[US-states]` breach notification, sales-tax<br>`[CA]` PIPEDA<br>`[BR]` LGPD | **None** — read-only by default; same data your merchant operations already process |
| **Logistics** | Shipments, tracking, addresses, commodity descriptions | `[EU]` GDPR, Dual-Use Regulation 2021/821, EU consolidated sanctions<br>`[UK]` UK DPA, UK Strategic Export Control, UK HMT sanctions<br>`[CH]` Swiss nFADP<br>`[US]` HTS, ITAR (22 CFR § 120-130), EAR (15 CFR § 730-774), 49 CFR hazmat, OFAC<br>`[SG]` MAS sanctions<br>`[Global]` HS classification (WCO), IMDG (sea), IATA DGR (air), UN sanctions, postal-service rules (USPS / Royal Mail / Deutsche Post / regional) | **None** — read-only by default; same data your trade-compliance team already screens |
| **Payments** | Charges, refunds, payouts, payment-method tokens (`last4`, `brand`, `expiry`, `fingerprint`) | `[Global]` **PCI-DSS v4.0.1 — _not_ triggered** (we never see PANs), card-network rules (Visa / Mastercard / Amex / Discover), UN sanctions<br>`[US]` BSA, FinCEN CTR / SAR, OFAC, NMLS state money-transmitter<br>`[EU]` EU AML framework, EU consolidated sanctions, PSD2 (Directive (EU) 2015/2366), EBA SCA RTS, PSD2 AISP<br>`[UK]` UK MLR 2017, UK HMT sanctions<br>`[SG]` Singapore AMLA, MAS sanctions<br>`[EU]` / `[UK]` / `[CH]` GDPR / UK DPA / Swiss nFADP (customer name, email, billing address are personal data even after PAN tokenisation) | **None** — read-only by default. PCI-DSS specifically is not triggered because card capture and tokenisation happen at the processor before any data reaches us |
| **Cross-vertical** | Aggregated data flow across the deployment | `[Global]` SOC 2 Type II (your deployment), ISO 27001 / 27017 / 27701<br>`[EU]` NIS2 (Directive (EU) 2022/2555), Cyber Resilience Act (Regulation (EU) 2024/2847), EU SCCs (2021/914)<br>`[UK]` UK IDTA<br>`[US]` HIPAA 6-yr retention, IRS § 6001 7-yr retention, SEC 17a-4<br>`[US-states]` breach notification (50 + DC)<br>`[EU]` / `[Global]` Schrems II + country-specific data-localisation | **None for default read mode.** Your existing ISMS, breach-response programme, and cross-border transfer mechanism extend over OpenSteward the same way they extend over any other internal service |

**The single sentence to take from this table:** every regime listed already applies to your application today, before OpenSteward is in the picture. Operating the same data flow through a self-hosted, read-only-by-default aggregation layer running in your VPC does not extend your regulatory perimeter. The only paths that change the analysis are named in [§ How to use this table](#how-to-use-this-table) (turning on `vertical:write`, wiring future PHI-bearing adapters, storing the cache outside your encrypted volume).

### Jurisdiction-tag key

Browser-search (`Ctrl+F` / `Cmd+F`) any of these tags to jump to every row on this page where it appears. Tags are deliberately short so they remain readable inside a table cell.

| Tag | Jurisdiction | Notes |
|---|---|---|
| `[EU]` | European Union | Extends to the EEA (Norway, Iceland, Liechtenstein) via the EEA Agreement. |
| `[UK]` | United Kingdom | Post-Brexit; UK DPA 2018 is the operative privacy law, MLR 2017 for AML, separate sanctions list. |
| `[CH]` | Switzerland | Swiss nFADP applies; not part of the EU but data-flow agreements track GDPR closely. |
| `[US]` | United States — federal | SOX, GLBA, FINRA, SEC, FCC, FTC, FDA, FinCEN, OFAC, ITAR, EAR, etc. |
| `[US-CA]` | US California (state) | CCPA / CPRA. Other US states are tracking with similar laws; we tag CA explicitly because it's the only one called out by name. |
| `[US-states]` | US state-level (varies) | Breach-notification (all 50 + DC), sales-tax (varies), money-transmitter licensing (CSBS aggregate). |
| `[CA]` | Canada | PIPEDA (federal privacy), CASL (anti-spam). Provincial variants apply additionally in QC/AB/BC. |
| `[BR]` | Brazil | LGPD. |
| `[SG]` | Singapore | PDPA, AMLA, MAS sanctions. |
| `[TH]` | Thailand | PDPA Thailand. |
| `[MY]` | Malaysia | PDPA Malaysia. |
| `[SE]` | Sweden | Skatteverket retention (Swedish tax authority; same shape applies elsewhere in EU under member-state tax law). |
| `[AU]` `[NZ]` `[IN]` | Australia / New Zealand / India | Tagged only where GST is named; the broader privacy regimes (APP / Privacy Act 2020 / DPDP 2023) are not currently in scope for any data class on this page. |
| `[Global]` | International / multilateral | UN sanctions, ISO standards, WCO HS classification, IMDG, IATA DGR, AICPA SOC 2 framework, GAAP / IFRS, private card-network rule books (Visa / Mastercard / Amex / Discover). |

### By jurisdiction — which regimes apply where

A pivot view of the data above. Pick your jurisdiction; see every regime from this page that touches you and which vertical(s) it surfaces in. Anchors link back to the long-form per-vertical sections for the authoritative source URL.

| Jurisdiction | Regimes that apply | Verticals where it surfaces |
|---|---|---|
| **European Union** `[EU]` | GDPR, EU UCPD, EU AML framework, PSD2 (Directive (EU) 2015/2366) + EBA SCA RTS, PSD2 AISP, EU Dual-Use Regulation 2021/821, NIS2 (Directive (EU) 2022/2555), Cyber Resilience Act (Regulation (EU) 2024/2847), EU SCCs (2021/914), EU consolidated sanctions list, EU VAT OSS, EU VAT IOSS, GDPR Art. 33 breach notification | [Accounting](#accounting-vertical), [CRM](#crm-vertical), [Ecommerce](#ecommerce-vertical), [Logistics](#logistics-vertical), [Payments](#payments-vertical), [Cross-vertical](#cross-vertical-regimes-apply-regardless-of-which-vertical-you-wire) |
| **United Kingdom** `[UK]` | UK DPA 2018, UK MLR 2017, UK Strategic Export Control, UK HMT sanctions, UK IDTA, CMA, UK ICO breach notification, HMRC retention | All verticals |
| **Switzerland** `[CH]` | Swiss nFADP | [Accounting](#accounting-vertical), [CRM](#crm-vertical), [Logistics](#logistics-vertical), [Payments](#payments-vertical) |
| **United States — federal** `[US]` | SOX § 404 (15 U.S.C. § 7262), SOC 1 ICFR, IRS § 6001 retention, GLBA, FTC consumer protection, FCC TCPA, FTC CAN-SPAM, FTC COPPA, FINRA Rule 4511, SEC 17a-4, ITAR (22 CFR § 120-130), EAR (15 CFR § 730-774), 49 CFR hazmat, OFAC, FinCEN BSA + CTR / SAR, NMLS money-transmitter, FDA, HIPAA, HTS | All verticals |
| **US California (state)** `[US-CA]` | CCPA / CPRA | [CRM](#crm-vertical), [Ecommerce](#ecommerce-vertical) |
| **US state-level (varies)** `[US-states]` | Breach-notification (all 50 + DC), sales-tax (state-by-state), money-transmitter licensing (NMLS aggregate) | [Accounting](#accounting-vertical), [Ecommerce](#ecommerce-vertical), [Payments](#payments-vertical), [Cross-vertical](#cross-vertical-regimes-apply-regardless-of-which-vertical-you-wire) |
| **Canada** `[CA]` | PIPEDA, CASL | [CRM](#crm-vertical), [Ecommerce](#ecommerce-vertical) |
| **Brazil** `[BR]` | LGPD | [CRM](#crm-vertical), [Ecommerce](#ecommerce-vertical) |
| **Singapore** `[SG]` | PDPA Singapore, Singapore AMLA, MAS sanctions | [CRM](#crm-vertical), [Payments](#payments-vertical), [Logistics](#logistics-vertical) |
| **Thailand** `[TH]` | PDPA Thailand | [CRM](#crm-vertical) |
| **Malaysia** `[MY]` | PDPA Malaysia | [CRM](#crm-vertical) |
| **Sweden** `[SE]` | Skatteverket retention | [Accounting](#accounting-vertical) |
| **Global / multilateral** `[Global]` | US GAAP, IFRS, AICPA SOC 2 Type II, ISO 27001 / 27017 / 27701, HS classification (WCO), IMDG (IMO, sea-freight hazmat), IATA DGR (air-freight hazmat), UN sanctions, Visa / Mastercard / Amex / Discover card-network operating rules, PCI-DSS v4.0.1 (industry-self-regulation, not in OpenSteward's scope), postal-service operating rules | All verticals |

**One footnote on economic groupings.** The codes here are jurisdiction-based, not economic-grouping-based — picking the regulator who actually enforces is more useful for a compliance officer than picking the trade bloc. EEA, GCC, ASEAN, USMCA, Mercosur, and similar groupings each contain multiple jurisdictions with their own privacy / financial / trade regimes; tag for the specific member state that applies to your operation. (The `[EU]` tag covers the EEA in practice because the EU regimes flow into the EEA Agreement.)

---

## Three questions every regulated operator asks first

- **Is this a hosted service?** No. OpenSteward is source-available code that you deploy inside your own infrastructure. Customer data never touches a third-party proxy. Deploying and running it for your own use needs no commercial licence. Each install reads a licence file, free to start and verified offline, that sets how many connections and tenants it may have ([installing it](../deployment/license.md)).
- **Does it hold SOC 2 / PCI-DSS / HIPAA certifications?** No — and neither does Postgres or nginx, for the same reason. The project ships an auditable codebase and a deployment topology your security team can certify under your existing programme. The certifications belong to your deployment, not to us.
- **Will it replace my policy admin / core banking / claims platform?** No. It sits beside them, normalising the third-party SaaS data that flows in and out (customers' accounting books, payment gateways, CRM tools, shipping carriers).

---

## Pick the playbook for your industry

| | Banking & lending | Insurance carriers & brokers |
|---|---|---|
| **Read** | [**For banks →**](./banks.md) | [**For insurance →**](./insurance.md) |
| **Headline** | Customer 360 across every payment + accounting platform your borrowers use. KYC-friendly consent for connecting their books. Internal AI risk agents without exposing prod DBs. | Pre-fill claims and underwriting from policyholders' accounting + commerce + logistics data. Broker-roll-up dashboards across CRMs. AI underwriting copilots on read-only data. |
| **Most-used verticals** | Payments (Stripe, Adyen, Worldpay, Braintree, …), Accounting (QuickBooks, Xero, Sage, Fortnox), CRM (Salesforce, HubSpot) | Accounting + Commerce (Shopify, BigCommerce, WooCommerce) + Logistics (FedEx, DHL, EasyPost) + CRM (Salesforce, HubSpot) |
| **Standout primitive** | Connect Link — the tokenised consent flow that satisfies a borrower KYC handoff. | Connect Link end-user mode — a policyholder authorises data pulls into their pre-filled claim. |
| **AI angle** | MCP **tenant mode** for internal risk + compliance copilots. | MCP **end-user mode** for customer-facing claims/underwriting chat. |

Don't pick by gut. Pick by which page describes the workflow you're actually trying to fund this quarter.

Already past picking and into selling it to the rest of your organisation? → [**Selling OpenSteward inside your organisation**](./selling-internally.md).

---

## Why this matters for regulated industries

Cross-industry levers, plainly stated:

- **Read-only by default.** The default API-key preset omits `vertical:write`. A freshly-minted key can read every vertical, manage customers, and consume Connect Link consents — but cannot mutate accounting / CRM / payments / commerce / logistics records upstream. Write capability is an explicit, scope-gated opt-in. The default posture is "we are looking, not changing."
- **Data sovereignty by construction.** Your customers' OAuth tokens, invoices, shipments, and payment records flow directly between their SaaS and your application. There is no middleware vendor in the data path to audit, no DPA to renegotiate, no jurisdiction we add to your processing chain.
- **Predictable economics.** Managed integration platforms bill per-call or per-connected-account — costs scale with your usage *and* your customer base. OpenSteward runs on infrastructure you already pay for. A million syncs a month cost the same as a thousand.
- **Auditable source instead of vendor trust.** When a procurement team or regulator asks "how does this vendor handle our data?", the honest answer is *here is the source — read it*. No NDA gate, no waiting on a SOC 2 report, no "trust us." See [`docs/security/README.md`](../security/README.md) for the live security posture.
- **Same regulatory perimeter, more controlled flow.** Reading data your application is already authorised to process — via an audited, encrypted-at-rest aggregation layer running in your VPC — does not add new regulatory regimes. It reorganises an existing data flow inside controls you already operate.
- **AI without a data-leak panic.** The included MCP server gives internal LLM tooling (Claude, Cursor, gemini-cli, custom agents) *read-only* access to canonical customer data via a typed tool surface. Your analysts no longer need production database credentials to ask "what was that customer's invoice volume last quarter?"

---

## What rules apply to the data we read, per vertical

This section is a reference, not a claim. The regimes below already govern the data classes your application is reading whether or not OpenSteward is in the picture. If your organisation is currently handling this data through manual exports, vendor SFTP feeds, or a managed integration platform, every one of these regimes already applies. Listing them here so your compliance team can confirm that *operating the same data flow through OpenSteward* doesn't extend the regulatory footprint they already maintain.

The "Already owned by" column names the team or role inside a typical regulated organisation that already has accountability for this data — not because OpenSteward delegates anything to them, but because if you're a bank or carrier touching this data, somebody at your shop is already responsible. If that column is empty in your org chart, that's a finding OpenSteward won't fix.

### Accounting vertical

**Data we read:** invoices, journal entries, accounts (AR / AP / GL), vendors, customers (the SMB's customers, not yours), tax codes and rates, exchange rates, attachments / receipts (where the upstream platform exposes them as URLs).

| Regime | What it governs | Already owned by |
|--------|------------------|------------------|
| [**SOX § 404 (15 U.S.C. § 7262)**](https://www.law.cornell.edu/uscode/text/15/7262) (US) / [**SOC 1 ICFR**](https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-1) | Internal controls over financial reporting for US-listed companies. Applies to any system that materially supports your published financials. | Controller, internal audit |
| [**US GAAP**](https://www.fasb.org/) (FASB) / [**IFRS**](https://www.ifrs.org/issued-standards/list-of-standards/) (IFRS Foundation) audit trails | Source-of-truth retention for general-ledger entries that feed audited statements. | Controller, external auditor |
| Tax-record retention — [**IRS § 6001**](https://www.ecfr.gov/current/title-26/section-1.6001-1) (US, 7 yr typical), [**HMRC**](https://www.gov.uk/self-employed-records) (UK, 6 yr), [**Skatteverket**](https://www.skatteverket.se/) (Sweden, 7 yr), equivalents per jurisdiction | Mandatory retention periods for records supporting tax filings. | Tax team, finance ops |
| [**GDPR**](https://eur-lex.europa.eu/eli/reg/2016/679/oj) (EU) / [**UK DPA 2018**](https://www.legislation.gov.uk/ukpga/2018/12/contents) / [**Swiss nFADP**](https://www.fedlex.admin.ch/eli/cc/2022/491/en) | Vendor and customer contact data inside accounting records is personal data. | DPO, privacy counsel |
| [**GLBA**](https://www.ftc.gov/business-guidance/privacy-security/gramm-leach-bliley-act) (US financial institutions) | Non-public personal information of consumers, including AR balances. | CCO, information-security |
| US state sales-tax (varies) / [**EU VAT OSS**](https://vat-one-stop-shop.ec.europa.eu/index_en) / GST (UK, AU, NZ, IN, SG variants) | Jurisdictional indirect-tax compliance derived from invoice line items. | Tax team |

### CRM vertical

**Data we read:** contacts, companies / accounts, deals / opportunities, activities (calls, emails, meetings), notes, custom fields. This is the most personal-data-dense vertical we cover.

| Regime | What it governs | Already owned by |
|--------|------------------|------------------|
| [**GDPR**](https://eur-lex.europa.eu/eli/reg/2016/679/oj) (EU) / [**UK DPA 2018**](https://www.legislation.gov.uk/ukpga/2018/12/contents) / [**Swiss nFADP**](https://www.fedlex.admin.ch/eli/cc/2022/491/en) | All EEA / UK / Swiss personal data. Subject access, right to erasure, processing records all apply. | DPO, privacy counsel |
| [**CCPA / CPRA**](https://oag.ca.gov/privacy/ccpa) (California) | Personal-information disclosures and deletion for California residents. | Privacy team |
| [**PIPEDA**](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/) (Canada) | Federal Canadian personal-information protection. | Privacy team |
| [**LGPD**](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) (Brazil) | Brazilian general data protection law. | Privacy team |
| [**PDPA Singapore**](https://www.pdpc.gov.sg/Overview-of-PDPA/The-Legislation/Personal-Data-Protection-Act) / [**PDPA Thailand**](https://www.pdpc.or.th/) / [**PDPA Malaysia**](https://www.pdp.gov.my/jpdpv2/laws-of-malaysia-pdpa/) | APAC personal-data regimes. | Regional compliance |
| [**TCPA**](https://www.fcc.gov/general/telemarketing-and-robocalls) (US, marketing call / SMS data) | Consent records and DNC compliance for outbound marketing. | Marketing ops, legal |
| [**CAN-SPAM**](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business) (US) / [**CASL**](https://fightspam.gc.ca/eic/site/030.nsf/eng/home) (Canada) | Outbound email consent and opt-out tracking. | Marketing ops |
| [**FINRA Rule 4511**](https://www.finra.org/rules-guidance/rulebooks/finra-rules/4511) / [**SEC 17a-4**](https://www.ecfr.gov/current/title-17/section-240.17a-4) | Communications retention for US broker-dealers. CRM activity logs commonly fall in scope. | Broker-dealer compliance (if applicable) |
| [**HIPAA**](https://www.hhs.gov/hipaa/index.html) | Only if the CRM stores PHI (e.g. healthcare-vertical CRM use). | Privacy + security (if applicable) |

### Ecommerce vertical

**Data we read:** products and variants, orders and line items, customers (the merchant's shoppers), fulfilments, refunds, inventory levels, discount / promo codes, shipping addresses.

| Regime | What it governs | Already owned by |
|--------|------------------|------------------|
| [**GDPR**](https://eur-lex.europa.eu/eli/reg/2016/679/oj) / [**CCPA / CPRA**](https://oag.ca.gov/privacy/ccpa) / [**LGPD**](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) / [**PIPEDA**](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/) | Customer PII inside orders, addresses, account records. | DPO, privacy team |
| [**COPPA**](https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa) (US, under-13 data) | Operators of services collecting data from children. Applies when ecommerce flows touch under-13 accounts. | Privacy team, product |
| [**US state breach-notification laws**](https://www.ncsl.org/technology-and-communication/security-breach-notification-laws) (all 50 + DC) / [**GDPR Art. 33**](https://gdpr-info.eu/art-33-gdpr/) / [**UK ICO**](https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/) | Notification obligations on access to "personally identifiable information." | Incident-response, legal |
| [**FTC**](https://www.ftc.gov/business-guidance/privacy-security) (US) / [**CMA**](https://www.gov.uk/government/organisations/competition-and-markets-authority) (UK) / [**EU UCPD**](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32005L0029) | Order, refund, and pricing data feeds into consumer-protection oversight. | Legal, customer ops |
| US state sales-tax (varies) / [**EU VAT OSS**](https://vat-one-stop-shop.ec.europa.eu/index_en) / [**IOSS**](https://vat-one-stop-shop.ec.europa.eu/index_en) / GST (UK, AU, NZ, IN, SG, etc.) | Indirect-tax compliance from order line items. | Tax team |
| Restricted-goods regulations — [**FDA**](https://www.fda.gov/) (US), alcohol / tobacco / firearm licensing (jurisdiction-specific), [**ITAR**](https://www.ecfr.gov/current/title-22/chapter-I/subchapter-M) / [**EAR**](https://www.ecfr.gov/current/title-15/subtitle-B/chapter-VII/subchapter-C) where SKUs surface | Product-category gating; the data we read can surface SKU descriptions. The compliance call lives with the merchant or marketplace operator. | Product compliance |
| [**PSD2 SCA**](https://www.eba.europa.eu/regulation-and-policy/payment-services-and-electronic-money) (EU / UK card-present commerce) | Strong customer authentication on the *checkout* — orchestrated by the upstream platform, not by us. Listed for completeness. | Payments / fraud |

### Logistics vertical

**Data we read:** shipments, tracking events, rates, labels (URLs / PDFs, not generated by us), addresses (sender + recipient), commodity descriptions where the upstream API exposes them, signature confirmations.

| Regime | What it governs | Already owned by |
|--------|------------------|------------------|
| [**GDPR**](https://eur-lex.europa.eu/eli/reg/2016/679/oj) / [**UK DPA 2018**](https://www.legislation.gov.uk/ukpga/2018/12/contents) / [**Swiss nFADP**](https://www.fedlex.admin.ch/eli/cc/2022/491/en) | Recipient name + address are personal data. | DPO, privacy team |
| [**HS classification**](https://www.wcoomd.org/en/topics/nomenclature/instrument-and-tools/hs-nomenclature-2022-edition.aspx) (WCO, global) / [**HTS**](https://hts.usitc.gov/) (US tariff codes) | Cross-border declarations for import / export. The carrier API surfaces declared values + HS codes; the compliance call is the shipper's. | Trade compliance |
| [**ITAR (22 CFR § 120-130)**](https://www.ecfr.gov/current/title-22/chapter-I/subchapter-M) / [**EAR (15 CFR § 730-774)**](https://www.ecfr.gov/current/title-15/subtitle-B/chapter-VII/subchapter-C) (US) | US export-controlled items. Commodity descriptions on shipments can surface controlled SKUs. | Trade compliance, export officer |
| [**EU Dual-Use Regulation 2021/821**](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32021R0821) / [**UK Export Control**](https://www.gov.uk/government/organisations/export-control-joint-unit) | Equivalent EU / UK regimes. | Trade compliance |
| Hazmat — [**US 49 CFR**](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I/subchapter-C) (PHMSA) / [**IMDG**](https://www.imo.org/en/OurWork/Safety/Pages/DangerousGoods.aspx) (sea) / [**IATA DGR**](https://www.iata.org/en/programs/cargo/dgr/) (air) | Dangerous-goods declarations on shipments. | Logistics compliance |
| Sanctions screening — [**OFAC**](https://ofac.treasury.gov/) (US) / [**EU consolidated list**](https://data.europa.eu/data/datasets/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions) / [**UK HMT**](https://www.gov.uk/government/publications/financial-sanctions-consolidated-list-of-targets) / [**UN**](https://main.un.org/securitycouncil/en/sanctions/information) / [**MAS**](https://www.mas.gov.sg/regulation/anti-money-laundering/targeted-financial-sanctions) (Singapore) | Recipient-address screening against denied-parties lists. Operator's existing sanctions programme applies to any recipient data they touch. | Sanctions / compliance |
| Postal-service regulations — [**USPS**](https://pe.usps.com/text/pub52/welcome.htm) (US), [**Royal Mail**](https://www.royalmail.com/business/help-and-support/prohibited-and-restricted-items) (UK), [**Deutsche Post**](https://www.deutschepost.de/en.html) (DE), regional equivalents | Carrier-specific rules on label formats, prohibited items, address validation. | Logistics ops |

### Payments vertical

**Data we read:** charges, refunds, payouts, balance transactions, customers, payment-method tokens (`last4`, `brand`, `expiry`, `fingerprint`), subscriptions, plans, disputes / chargebacks, fee schedules.

| Regime | What it governs | Already owned by | Triggered by OpenSteward? |
|--------|------------------|------------------|------------------|
| [**PCI-DSS v4.0.1**](https://www.pcisecuritystandards.org/document_library/?category=pcidss) | Full-PAN cardholder data + sensitive authentication data. | Application security, payments | **No** — we read post-tokenisation data only. See [banks.md § The regulatory boundary](./banks.md#the-regulatory-boundary--read-only-by-default-no-new-regimes) for the long form. |
| AML / KYC / CDD — [**US BSA**](https://www.fincen.gov/history-anti-money-laundering-laws) / [**EU AML framework**](https://finance.ec.europa.eu/financial-crime/anti-money-laundering-and-countering-financing-terrorism_en) / [**UK MLR 2017**](https://www.legislation.gov.uk/uksi/2017/692/contents/made) / [**Singapore AMLA**](https://www.mas.gov.sg/regulation/anti-money-laundering) | Customer due diligence on payments parties. The KYC obligation lives with the regulated entity (you), not with the data-aggregation layer. | AML / financial-crime team | No — we surface charges, not KYC decisions |
| Sanctions screening — [**OFAC**](https://ofac.treasury.gov/) / [**EU**](https://data.europa.eu/data/datasets/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions) / [**UK HMT**](https://www.gov.uk/government/publications/financial-sanctions-consolidated-list-of-targets) / [**UN**](https://main.un.org/securitycouncil/en/sanctions/information) | Counterparty screening against denied-parties lists. | Sanctions / compliance | No — we surface the transaction; you screen it |
| [**FinCEN CTR / SAR reporting**](https://www.fincen.gov/resources/filing-information) | Currency Transaction Reports and Suspicious Activity Reports. | AML team | No — derived from your monitoring, not from us |
| [**PSD2 (Directive (EU) 2015/2366)**](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32015L2366) / [**EBA SCA RTS**](https://www.eba.europa.eu/regulation-and-policy/payment-services-and-electronic-money) (EEA + UK) | Two-factor authentication on payment initiation at checkout. Enforced by the upstream payment processor at point of sale. | Payments team | No — we read settled data, not checkout |
| [**PSD2 AISP**](https://www.eba.europa.eu/regulation-and-policy/payment-services-and-electronic-money) (Account Information Service Provider) | Regulated status for accessing consumer-bank accounts on a customer's behalf. | Banking partnership (only if applicable) | No — we connect to payment gateways, not consumer-bank accounts |
| Card-network operating rules — [**Visa**](https://usa.visa.com/support/consumer/visa-rules.html), [**Mastercard**](https://www.mastercard.us/en-us/business/overview/support/rules.html), Amex, Discover | Issuer / acquirer obligations. | Payments team | No — these apply at processor level, before data reaches us |
| US state money-transmitter licensing — [**NMLS / SRR**](https://nationwidelicensingsystem.org/about/Pages/default.aspx) + [**FinCEN MSB registration**](https://www.fincen.gov/money-services-business-msb-registration) | Required if you hold customer funds in transit. | Legal, compliance | No — we never custody funds |
| [**GDPR**](https://eur-lex.europa.eu/eli/reg/2016/679/oj) / [**UK DPA 2018**](https://www.legislation.gov.uk/ukpga/2018/12/contents) / equivalent | Customer email, name, billing address are personal data even after PAN tokenisation. | DPO, privacy team | Yes — perimeter unchanged from existing handling |

### Cross-vertical regimes (apply regardless of which vertical you wire)

| Regime | When it applies |
|--------|----------------|
| [**SOC 2 Type II**](https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2) (your deployment) | If you publish a SOC 2 report, your OpenSteward deployment is in your `Security` / `Availability` / `Confidentiality` trust-service-criteria scope, because it's infrastructure inside your environment. (This is your deployment's SOC 2, not ours.) |
| [**ISO/IEC 27001**](https://www.iso.org/standard/27001) / [**27017**](https://www.iso.org/standard/43757.html) (cloud) / [**27701**](https://www.iso.org/standard/71670.html) (privacy) | Your existing ISMS extends over OpenSteward the same way it extends over any other internal service. |
| [**NIS2 (Directive (EU) 2022/2555)**](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022L2555) / [**Cyber Resilience Act (Regulation (EU) 2024/2847)**](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R2847) | Critical-infrastructure incident-reporting and supply-chain security. OpenSteward is part of your supply chain only if you obtained it as a binary; as source, your build process is your supply-chain control point. |
| [**US state breach-notification laws**](https://www.ncsl.org/technology-and-communication/security-breach-notification-laws) | Apply uniformly to any data set holding PII. |
| Records-management retention — [**SEC 17a-4**](https://www.ecfr.gov/current/title-17/section-240.17a-4) (broker-dealer), [**HIPAA**](https://www.hhs.gov/hipaa/for-professionals/privacy/laws-regulations/index.html) 6-yr minimum, [**IRS § 6001**](https://www.ecfr.gov/current/title-26/section-1.6001-1) 7-yr, etc. | OpenSteward's resource cache is one place a record might be retained; your data-retention policy applies to it the same way it applies to a Postgres replica. |
| Cross-border data transfer — [**Schrems II (C-311/18)**](https://curia.europa.eu/juris/document/document.jsf?docid=228677) / [**EU SCCs (2021/914)**](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32021D0914) / [**UK IDTA**](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/) / country-specific localisation | Determined by where you deploy. Self-hosting in-region is the standard mitigation. |

### How to use this table

This is intended for the conversation between your platform team and your compliance team that goes:

> *"We're considering deploying this. Which of the regimes we already maintain does it touch, and does it expose us to anything new?"*

For most rows the answer is **"yes it touches this, no it doesn't expose you to anything new — you were already handling this data class under this regime through your existing tooling."** The exceptions where it *would* extend your scope are:

- Turning on `vertical:write` scopes — once you allow OpenSteward to mutate upstream records, your SOX / accounting-records / data-integrity controls extend over those write paths.
- Wiring a future adapter that crosses into a new data class (e.g. a hypothetical FHIR adapter would bring PHI in scope; none ship today).
- Storing the resource cache outside an encrypted volume on a host your existing infosec programme doesn't cover.

If your compliance team doesn't have a clean answer for one of these rows against your *current* tooling, that's a pre-existing gap, not one introduced by OpenSteward.

---

## How to evaluate this for your organisation

Four steps. None of them require a sales call.

1. **Run it locally.** `git clone`, `docker compose up`. The full stack — admin UI, integration server, docs server, webhook gateway — is on your laptop in under five minutes. No telemetry, and no licence needed yet: without one, OpenSteward runs in community mode, with one connection.
2. **Hit the built-in sandbox first.** Every vertical serves seeded fixture data at `/test/v1` — mint a test key (`pnpm --filter integration-server mint-api-key --tenant default --test`, or the admin UI; deployments can also enable unauthenticated self-serve keys at `POST /test/v1/keys`), list `/test/v1/connections` (they always exist — no OAuth, no upstream accounts, no egress), and call any resource.
3. **Then wire one real sandbox connection per vertical you care about.** For banking: one Stripe sandbox + one QuickBooks sandbox. For insurance: one Salesforce sandbox + one QuickBooks Online sandbox. A second connection needs a licence: a free one from [opensteward.dev/license](https://opensteward.dev/license) covers it ([installing it](../deployment/license.md)). The Connect Link flow is the same one you'd ship to a real customer.
4. **Audit the security posture.** Read [`docs/security/README.md`](../security/README.md) — the mock pen-test report includes the hardening implementation status and the deployment topology your security team would inherit. The pen-test playbook at the end is reproducible against your own dev instance.

If the answers convince you, the conversation with your platform team is "we are deploying OpenSteward in our VPC," not "we are signing with another integration vendor."

---

## See also

- [Selling this inside your organisation](./selling-internally.md) — per-stakeholder cheat sheet for the internal champion
- [Why OpenSteward](../why-opensteward.md) — the industry-agnostic value props
- [Security report + hardening status](../security/README.md) — what's mitigated, what remains
- [Auth and tenancy](../architecture/auth-and-tenancy.md) — the five-layer auth model your security team will ask about
- [Developer Guide](../dev-api.md) — what your engineers actually integrate with
