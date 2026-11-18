# Commercial licensing

OpenSteward's code is free to use for almost everything. How much one install
can do is set by its license file. This page explains license files, and the
one use that needs a commercial licence.

## You probably don't need a commercial licence

The [`LICENSE`](./LICENSE) already permits, with no commercial licence:

- Running OpenSteward internally, in production, for as long as you like,
  within the limits of each install's license file (below).
- Modifying it, forking it, maintaining your own branch — with the license
  checks left intact (see below).
- Embedding it in a product you sell — including a SaaS product — and letting
  your customers connect their own platforms through Connect Link and read
  their data through the unified API.
- Redistributing it inside commercial and closed-source software, including
  on-premises deployments you sell to your own customers.
- Consulting, deployment, hosting, and support services around an OpenSteward
  instance operated for a single customer's own use.

If your use is on that list, you don't need a commercial licence or to contact
anyone. What each install may do is set by its license file.

## License files

Each install reads a license file that sets the connections, tenants, and
features it may use. License files, including a free one, come from
<https://opensteward.dev/license> (also at <https://license.opensteward.dev>),
which lists the current plans and their limits. They are issued under the
[license terms](https://license.opensteward.dev/terms) you accept when you sign
up. Without one, OpenSteward runs in community mode: one connection and one
tenant.

- A license file is for one install only. Each install beyond community mode
  needs its own.
- When a license expires, the install keeps its licensed features for 30 days,
  then runs in community mode. Nothing is deleted.
- In software you sell to your own customers, either your organization or your
  customer's may hold each install's license file.
- A paid license file is not a commercial licence. It raises an install's
  limits; it does not permit the use described below.

See [Installing and renewing your license](docs/deployment/license.md).

The checks that read the license file are the license key functionality the
Elastic License 2.0 protects: removing, disabling, or working around them is
not permitted, in a fork or anywhere else. A build that does so is not
licensed.

## When you do need one

One thing is reserved:

> Operating OpenSteward as a multi-tenant hosted or managed unified-API service
> that you offer to third parties, where what those third parties are buying is
> access to integration functionality itself.

That is the product OpenSteward's maintainer sells. If that's what you want to
build, a commercial licence is available — it isn't a "no," it's a
conversation.

You may also want a commercial licence if you need something the standard terms
don't give you, such as:

- Written confirmation that your specific architecture is permitted, for your
  legal or procurement team.
- An indemnity, a warranty, or a support SLA.
- Permission to remove or replace OpenSteward attribution beyond what the
  standard terms allow.
- Different terms around trademark use (see [`TRADEMARKS.md`](./TRADEMARKS.md)).

## The grey area, and how it's resolved

Almost any use is permitted. What is reserved is offering OpenSteward to
third parties as a hosted or managed service whose primary value is its
unified API, adapter catalog, or Connect flow. The question that settles
almost every case is **what your customer is paying for**. If OpenSteward is
one ingredient in something else they buy, the use is permitted. If
integration access is what they are buying, it is not.

Separately, removing, disabling, or working around the license checks is
never permitted, whatever the use.

### Common scenarios

| Scenario | Example | What the customer pays for | Verdict |
|---|---|---|---|
| Internal use | A merchant reconciles its own Shopify orders, Stripe payouts and Fortnox ledger | Nothing; internal use | **Permitted** |
| Credit underwriting | A bank pulls an SME applicant's accounting and payments data to price a loan | A loan | **Permitted** |
| Insurance pricing | An insurer prices trade-credit or cargo cover from revenue and shipment data | An insurance policy | **Permitted** |
| Receivables financing | A factoring company reads open invoices to finance them and monitor payment | Financing | **Permitted** |
| Revenue-based financing | A lender reads subscription MRR and payouts to set an advance limit | Capital | **Permitted** |
| Merchant onboarding | An acquirer imports a switching merchant's charge and dispute history for risk scoring | Acquiring services | **Permitted** |
| Accounting bureau | A bureau aggregates its clients' books into one internal close dashboard | Bookkeeping | **Permitted** |
| Audit / due diligence | An advisor extracts ledgers and CRM pipeline for a transaction review | The audit or review | **Permitted** |
| Portfolio monitoring | A PE fund monitors its portfolio companies' accounting and CRM | Nothing; internal use | **Permitted** |
| Vertical SaaS | A field-service SaaS syncs its customers' accounting systems | Field-service software | **Permitted** |
| Agency or host, one client | An agency hosts and runs an instance for one client's own use | The agency's work | **Permitted** |
| Agency or host, many clients | A provider runs a dedicated instance for each client, each for that client's own use | Hosting and support | **Permitted** |
| Unified API reseller | A shared "connect to 40 accounting systems with one API" service for developers | Integration access | **Not permitted** |
| Hosted MCP gateway | A shared "connect your AI agent to your business tools" service | Integration access | **Not permitted** |
| iPaaS / connector marketplace | OpenSteward connectors offered as building blocks in an automation platform | Integration access | **Not permitted** |
| Shared managed service | One hosted OpenSteward service sold to many customers | OpenSteward itself | **Not permitted** |
| Removing the license checks | Patching out the connection or tenant limits, using one license file for several installs, or using an install beyond its license file's limits by other means | — | **Never permitted** (license key functionality) |
| Customer-facing MCP endpoint | A vertical SaaS lets its customers' AI agents query their own synced data | Depends on scope | **Depends**: see questions 4 to 6 |
| Embedded finance / BaaS | A provider lets partner fintechs pull customer data through its stack | Depends on what partners buy | **Depends**: see question 4 |
| Integrations add-on | A SaaS sells "Integrations" as a separately priced SKU | Depends on packaging | **Ask us** |
| Data marketplace | A platform collects SME data once and shares it with many lenders | Depends on who pays | **Ask us** |

### Questions that settle the rest

Answer in order and stop at the first verdict.

1. **Is the deployment used only by your own organization and its affiliates,
   for internal purposes?**
   Yes → **Permitted.** No → go to 2.

2. **Do you host, deploy, or support a dedicated instance for one customer,
   used for that customer's own purposes?**
   Yes → **Permitted.** No → go to 3.

3. **Do third parties use OpenSteward's functionality directly — its APIs, MCP
   tools, or connectors — beyond connecting their own accounts through Connect
   Link?**
   No, they see only results inside your product, such as a credit decision, a
   dashboard, or synced records → **Permitted.** Yes → go to 4.

4. **Is that access one feature of a broader product, limited to your
   product's own domain?**
   No, it offers general integration access across platforms or verticals →
   **Not permitted.** Yes → go to 5.

5. **Do you sell or market integration access on its own: as a standalone
   product, a separately priced add-on, or data sold to anyone other than the
   business it belongs to?**
   Yes → **ask us before you deploy** (see [Getting in touch](#getting-in-touch)).
   It turns on whether integration access becomes the primary value you
   offer. No → go to 6.

6. **The removal test: if your product had no integrations at all, would your
   customers still be buying it?**
   Yes → **Permitted.** No → integration access is what they buy → **Not
   permitted.**

If your case still isn't clear, ask. A written answer is free and usually takes
a day. Nobody benefits from you guessing, least of all a project that wants to
be adopted.

## Getting in touch

Email **support@opensteward.dev** with a short description of what
you're building and how OpenSteward fits into it. Enough detail to say what
your customers are paying for is plenty — no NDA needed to start.

## Compliance

If you're already doing something that needs a licence and you didn't realise:
the Elastic License 2.0 gives you 30 days from written notice to come into
compliance, after which your licences are reinstated retroactively. A license
file is revoked for a breach only if it is not fixed within those 30 days; a
file that leaked can be revoked at once. In practice, get in touch and it gets
sorted out. The point of this licence is to
prevent a competing service being built on this code, not to catch people out.
