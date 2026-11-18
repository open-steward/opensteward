# Why OpenSteward?

Managed integration platforms (Merge, Apideck, Plaid, Fivetran, etc.) solve a real problem but make a significant trade-off: every API call your product makes routes through their infrastructure, and every integration you need is gated by their roadmap. For many companies that trade-off is acceptable. For others it isn't.

OpenSteward is a source-available alternative: self-hosted, auditable, extensible, and free to embed in commercial products. The benefits below are what that combination unlocks.

---

## Data sovereignty & compliance

When you self-host OpenSteward, customer data flows directly between your application and the upstream platform — your CRM records, invoices, shipments, and OAuth tokens never touch a third-party server. This matters for:

- **Regulated industries** — HIPAA, PCI-DSS, SOC 2, and ISO 27001 frameworks often require you to demonstrate that sensitive data stays within a defined boundary. A managed proxy sits outside that boundary by definition.
- **Enterprise sales** — Large customers increasingly require data processing agreements (DPAs) and vendor security reviews. Removing the integration middleware from the data path removes one more vendor from that conversation.
- **Geographic data residency** — GDPR, Swiss nFADP, and similar laws restrict cross-border data transfers. Running OpenSteward in your own cloud region means the data never leaves the jurisdiction you've agreed to.

Related: [`docs/architecture/auth-and-tenancy.md`](./architecture/auth-and-tenancy.md)

---

## No per-call pricing

Managed platforms charge per API call, per connected account, or per seat — costs that scale directly with your usage and your customers. OpenSteward runs on whatever infrastructure you already have. A single instance handling millions of syncs per month costs the same as one handling thousands.

The pricing model is your infrastructure bill. Nothing else.

---

## No vendor lock-in

Your integration logic — auth flows, field mappings, webhook handlers — lives in your own codebase, versioned alongside your product. Migrating away from a managed platform typically means rewriting those flows from scratch. With OpenSteward, there is nothing to migrate: the code is already yours, the data is already yours, and the platform vendors you integrate with are connected directly rather than through an intermediary.

---

## Full observability

You control the logs, metrics, and tracing. There is no support ticket to file when you need to understand why a sync failed at 2 AM — the data is in your own observability stack.

Every adapter call, webhook delivery, circuit-breaker state transition, and credential read is yours to instrument. Pipe it into whatever you already run: Prometheus, Datadog, Grafana, OpenTelemetry collectors, Loki, Sentry.

Related: [`docs/architecture/`](./architecture/)

---

## Source-available freedoms

OpenSteward is released under the [Elastic License 2.0 plus an Additional Use Grant](../LICENSE). There is exactly one restriction, and it is unlikely to apply to you. In plain terms:

- **Commercial use** — run it in production, for any purpose. No per-seat royalty, no revenue share, no usage reporting. A license file sets how many connections and tenants an install may have: a free one is available at [opensteward.dev/license](https://opensteward.dev/license), and it is verified offline, so nothing phones home. Without one, OpenSteward runs in community mode (one connection, one tenant). See [Installing and renewing your license](./deployment/license.md).
- **Embed it in what you sell** — ship OpenSteward inside your own product, including a SaaS product. Your customers can connect their own platforms through Connect Link and read their data through the unified API. This is explicitly permitted by the Additional Use Grant.
- **Embed in proprietary code** — link OpenSteward into closed-source applications. Copyleft licenses (AGPL, GPL) do not permit this; OpenSteward does.
- **Fork freely** — maintain your own branch indefinitely, with your own modifications. No "open core" tier that withholds features: enterprise SSO, SCIM, and every one of the 1,548 adapters are in the box.
- **Redistribute it** — including on-premises deployments you sell to your own customers, and consulting or hosting you operate for a single customer's own use.
- **Patent grant** — the license grants you a patent license from the licensor, the same concrete defensive protection Apache-2.0 provides and MIT and BSD do not.

**The one restriction:** you may not operate OpenSteward as a multi-tenant hosted unified-API service offered to third parties, where what those third parties are buying is access to integration functionality itself. That is the product OpenSteward's maintainer sells. If that is what you want to build, it needs a [commercial license](../COMMERCIAL-LICENSE.md) — which is a conversation, not a refusal.

The test is about product identity: *is unified integration access the thing your customers are paying you for?* A vertical SaaS that syncs its customers' accounting systems is selling vertical SaaS — permitted. A platform selling "one API for 1,500 integrations" is selling integration access — that needs a license.

**Contributing requires a CLA** ([`CLA.md`](../CLA.md)). You keep the copyright to your contribution; the CLA adds permission for the project to license it under any terms, which is what keeps commercial licensing — and any future move to a more permissive license — possible.

Full text: [`LICENSE`](../LICENSE) · attribution: [`NOTICE`](../NOTICE) · trademarks: [`TRADEMARKS.md`](../TRADEMARKS.md) · commercial licensing: [`COMMERCIAL-LICENSE.md`](../COMMERCIAL-LICENSE.md) · contribution process: [`CONTRIBUTING.md`](../CONTRIBUTING.md)

---

## Auditable source

Every line of OpenSteward is readable by anyone evaluating it. This matters more than it sounds:

- **Security review** — your security team can audit the credential store, encryption at rest, OAuth token handling, and webhook HMAC verification without signing an NDA or waiting on a vendor's SOC 2 report.
- **Supply-chain transparency** — every dependency is visible in `package.json` / `pnpm-lock.yaml`. Every transform function that touches customer data is inspectable.
- **Enterprise buyer trust** — when a prospect's procurement team asks "how does this vendor handle our data?", the answer is "here is the source — read it."
- **Reproducible builds** — identical inputs produce identical outputs. No black-box behavior changes between versions.

Related: [`packages/shared/`](../packages/shared/) (credential store, OAuth helpers, webhook verification)

---

## Extensibility

OpenSteward is designed to be extended, not just consumed.

- **Custom adapters** — each vertical exposes a typed adapter interface (`AccountingAdapter`, `CrmAdapter`, `EcommerceAdapter`, `LogisticsAdapter`, `PaymentsAdapter`, `DocsignAdapter`, `ProjectsAdapter`, `CustomerSupportAdapter`, `InventoryAdapter`). Implement only the methods your customer needs; unimplemented operations return `501` cleanly. Reference adapters (Fortnox, Nutshell, Shopify, EasyPost, Stripe, DocuSign, Asana, Zendesk, Cin7 Core) are full working examples.
- **New verticals** — copy any existing vertical under `apps/integration-server/src/verticals/<name>/` and rewrite the adapter interface for your domain. Adjacent domains (HR, billing, analytics, communications) follow the same shape.
- **In-tree or out-of-tree** — contribute adapters upstream for community maintenance, or keep proprietary adapters in your own repo. The adapter registry accepts either.

Related: [`CONTRIBUTING.md`](../CONTRIBUTING.md)

---

## Adapter breadth

1,548 platforms across nine verticals:

| Vertical | Adapters | Reference | Platform list |
|----------|---------:|-----------|---------------|
| Accounting | 281 | `fortnox` | [platforms.md](./platforms/platforms.md) |
| CRM | 152 | `nutshell` | [platforms.md](./platforms/platforms.md) |
| Ecommerce | 176 | `shopify` | [platforms.md](./platforms/platforms.md) |
| Logistics | 320 | `easypost` | [platforms.md](./platforms/platforms.md) |
| Payments | 159 | `stripe` | [platforms.md](./platforms/platforms.md) |
| E-signature | 116 | `docusign` | [platforms.md](./platforms/platforms.md) |
| Projects | 116 | `asana` | [platforms.md](./platforms/platforms.md) |
| Customer Support | 105 | `zendesk` | [platforms.md](./platforms/platforms.md) |
| Inventory | 123 | `cin7-core` | [platforms.md](./platforms/platforms.md) |

Each adapter includes full auth (OAuth 2.0 or API key), canonical resource transforms, and webhook signature verification where the platform publishes a signing scheme. Platform logos are not shipped — the catalog renders brand-tinted monogram tiles by default, and operators opt in to real logos via `LOGO_SOURCE` (see [`docs/operations/platform-logos.md`](./operations/platform-logos.md)). The default install makes no third-party requests at all.

---

## Unified schema

One canonical shape per resource, regardless of which platform sourced it. Built on Zod, modelled after Unified.to's standard for accounting / CRM / logistics, anchored to Shopify's richer shapes for ecommerce, and to Stripe for payments.

- **Canonical types are the source of truth** — defined in `apps/integration-server/src/verticals/<name>/schema/` (one directory per vertical)
- **Transforms are pure functions** — raw platform object in, canonical shape out. No side effects, no API calls.
- **The `metadata` field preserves everything** — every canonical resource carries the complete, unmodified raw platform response under `metadata`. Nothing is lost; nothing is filtered. If your use case needs a platform-specific field the canonical schema doesn't expose, it's right there.

The full canonical surface is rendered in [`docs/api-reference/api-reference.md`](./api-reference/api-reference.md) and the live OpenAPI spec at [`docs/openapi/openapi.json`](./openapi/openapi.json).

---

## Type-safe & Zod-validated

- **TypeScript strict everywhere** — no `any` escape hatches in canonical paths
- **Zod at every boundary** — request bodies, adapter outputs, webhook payloads, config files are all validated at runtime. Type safety does not stop at the compiler.
- **7,900+ Vitest test files** — unit + integration coverage across every vertical, adapter, router and the shared control plane. New adapters include transform tests by convention, and `check:transform-tests` fails the build when a transform ships without one.

---

## Default-on data store

A self-hosted aggregator that goes to upstream every read is just a paid axios proxy. OpenSteward ships a SQLite read-through cache + per-vertical sync workers default-on, so:

- **Reads serve from local disk** when warm. Single-digit-millisecond latency, no upstream rate-limit pressure.
- **Writes write through** — POST / PATCH / DELETE go upstream first, then the cache row updates. Reads after the write see the new value without a re-fetch.
- **`?is_live=true`** bypasses the cache for any GET when you want fresh data (audit-trailed; still writes back).
- **Bulk populate via `POST /v1/{vertical}/sync`** — paginates upstream and warms every resource type per connection. Auto-fires on Connect Link consume so customer data is in the cache before your app reads it.
- **Three modes**: `database` (default — local cache), `passthrough` (every request live; opt-out for apps that already have their own DB), `external` (cache + signed outbound `resource.synced` / `resource.updated` / `resource.deleted` events fanned out via the existing webhook delivery system, so your warehouse / Postgres / Kafka can subscribe).

See [`docs/dev-api.md §7`](./dev-api.md#7-data-store-is_livetrue-and-sync) for the request-path semantics and [`docs/architecture/persistence.md`](./architecture/persistence.md#operating-the-resources-cache) for operations (disk planning, HA, troubleshooting).

---

## When a managed platform is the better choice

Self-hosting means you own the operations. If your team does not want to manage uptime, certificate rotation, credential rotation, or adapter maintenance, a managed platform trades cost for convenience, and that's a legitimate trade.

OpenSteward is the right fit when **data control, compliance, or cost at scale outweigh the operational overhead** — and when you'd rather own your integration layer than rent it.

If you need the opposite — zero ops, fastest possible time-to-first-integration, and you're comfortable with usage-based pricing and a vendor in the data path — a managed platform is probably the better choice. 
