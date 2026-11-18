# Transform conformance caveats

Known limits and latent defects in how adapter transforms conform to the canonical schemas. Each entry is a deliberate trade-off or an unfixed bug that is documented rather than silently carried. See `docs/architecture/testing.md` (Layer 1 — Adapter transform unit tests) for how the schema-assertion ratchet that enforces conformance is composed.

The framing fact that sets the severity for everything here: **nothing validates transform output in production.** The routers `safeParse` request bodies only (`accounting/router/invoices.ts:40,52`) and then `listResponse(items)` returns straight through. The canonical schema is enforced *only* by the transform unit tests, which makes the schema-assertion ratchet the actual conformance gate rather than a nicety.

---

## 1. The schema-assertion guard under-detects

Two holes in `scripts/check-transform-schema-assertions.ts` narrow what "every file outside the baseline asserts conformance" actually guarantees:

- **Whole-numbered decimals pass silently.** The assertion (`expect(() => XSchema.parse(result)).not.toThrow()`) only fails a minor-units bug when the value has a **fractional** part, because canonical `Amount` fields are `z.number().int()` — `'-150.00'` parses to `-150`, a valid integer, and `.int()` accepts it. An adapter passing through a raw decimal amount that happens to be whole-numbered (e.g. `total: 150` instead of `150.00`) produces no detectable failure at all. The true minor-units bug count across the corpus is therefore unknowable from this guard alone — any count of caught bugs is a lower bound.
- **Negative assertions count as compliant.** `HAS_SCHEMA_ASSERTION` (`scripts/check-transform-schema-assertions.ts:76`) is the regex `/\w+Schema\s*\.\s*(?:safeParse|parse)\s*\(/` — it checks that a schema's `parse`/`safeParse` is *called* somewhere in the file, not that the call is asserted to succeed. A **negative** assertion, `expect(() => XSchema.parse(result)).toThrow()`, matches just as well, so a test that asserts its own transform's output is *invalid* counts as compliant. `apps/integration-server/tests/verticals/accounting/unit/adapters/yooz/transform/bill.test.ts:128` does exactly this (documenting the known yooz float-amount bug in §3 below), so it sits outside the baseline entirely. The regex is deliberately left this loose to avoid baseline churn, but the guard's real coverage is narrower than the baseline implies.

## 2. Offset-less datetime handling

The shared `toIsoDatetime` (`packages/shared/src/schemas/iso.ts`, exported from `@opensteward/shared`, ~977 call sites across every vertical) treats an offset-less datetime (e.g. MySQL-style `'2019-11-27 11:40:36'`) as **UTC**, pinning it with an appended `Z` before parsing. That is the right *default* — nearly every platform API that omits an offset documents UTC — but it is a per-platform assumption, and several paths sit outside it:

- **Platforms whose offset-less wire format is not UTC** are deterministically wrong. Two are documented in their own adapters: Helcim documents `dateCreated` as `YYYY-MM-DD HH:MM:SS` **Mountain Time** (the doc comments in `payments/adapters/helcim/transform/{charge,invoice,payment-method,plan,subscription}.ts` say so; `refund.ts` uses the same field without the note) yet all six files call `toIsoDatetime` directly with no MT offset applied. Salla reports `{ date: '2022-06-16 14:48:20.000000', timezone: 'Asia/Riyadh' }` — `RawSallaDateObj` in `ecommerce/adapters/salla/transform/order.ts` types the `timezone` field, and `parseSallaDate()` reads only `date.date`, discarding it. No test asserts either field's value, so neither shows up as a suite failure. A real fix is an `assumeUtc`-style per-platform option (or wrapper), defaulted from each platform's documented wire format — not a blanket change, since not every offset-less source is UTC.
- **Exotic ISO 8601 shapes fall through host-local.** The offset-less-detection regex (`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$`) requires an uppercase `T`. Three RFC 3339 §5.6-legal shapes miss it and hit `new Date()` un-pinned, resolving in the host's zone: a lowercase `t` separator (RFC 3339 permits `t`/`T` interchangeably — note the asymmetry with lowercase `z`, which the offset-detection *does* handle), an expanded-year value (`'+002025-01-01T10:30:00'`), and free-text formats (`'Jan 1, 2025 10:30:00'`). None of the three shapes appears anywhere in `src/` or `tests/` — theoretical exposure, not observed.
- **25 adapters shadow the name `toIsoDatetime` with a local reimplementation.** 25 `transform/shared.ts` files across `payments/` and `docsign/` define their own `export function toIsoDatetime(...)`, imported by sibling files `from './shared'` rather than `from '@opensteward/shared'` — at any call site inside those adapters, `toIsoDatetime(x)` reads as the canonical helper but isn't. Full list: `blueink`, `legaldesk`, `bridge-open-banking`, `dwolla`, `easebuzz`, `global-payments`, `interswitch`, `instamojo`, `moov`, `mpesa`, `pagseguro`, `payoneer`, `spoton`, `splitit`, `stitch`, `tink`, `sumup`, `triple-a`, `tyro`, `viva-com`, `truelayer`, `yapily`, `wise`, `zip-bnpl`, `zuora`. Spot-checks (`dwolla`, `moov`, `mpesa`, `wise`, `zuora`, `stitch`, `blueink` — 7 of 25) share an identical copy-pasted body that hands strings straight to a bare `new Date(value)` — host-local-dependent, since the shared UTC pin never runs. **`easebuzz` is not one of the bugs**: its local `toIsoDatetime` is a deliberate, correct IST (+05:30) pin — it illustrates only the *naming*-shadow hazard. `legaldesk` special-cases numeric epoch input but falls through to a plain `new Date()` for strings. The remaining files have not been individually verified; treat "most are bare `new Date()`" as a spot-checked majority, not an exhaustive count.
- **`insightly` mangles offset-carrying inputs.** All 5 of its transform files guard with `` date.endsWith('Z') ? date : `${date}Z` `` — checking only for a trailing `Z`, not a numeric `±HH:MM` offset. An input like `'2019-11-27T11:40:36+05:00'` falls through to the append branch and becomes `'…+05:00Z'`, a malformed string that `new Date()` rejects or parses unpredictably depending on engine. Confirmed by reading the guard, not against a real Insightly payload.
- **`d4sign`'s UTC-pinning branch is dead code.** `docsign/adapters/d4sign/transform/shared.ts` (`toIso()`) doesn't route through the shared helper. Its comment says values are treated as UTC, but the implementation tries `new Date(str)` **first** and returns immediately on success — and V8 host-local-parses both `'2025-01-01 10:30:00'` and `'2025-01-01T10:30:00'` on that first call, so the explicit `T`+`Z` branch below it is unreachable. d4sign is host-local-dependent, and its 3 tests assert no datetime-typed field, so nothing in the suite catches it.
- **Logistics: real exposure is much smaller than the raw count suggests.** `logistics/adapters/shared/transform.ts:73` (`toISODate` — bare `new Date(val)`, returning a `Date`, a different signature from `toIsoDatetime` entirely) is referenced by ~1,102 files across `logistics/`, against only ~20 logistics files importing the shared `toIsoDatetime`. But of the ~430 repo-wide `toIso`-family files, only ~8 document an offset-less wire format in their own comments — most logistics platforms send an offset already, so the 1,102 figure substantially overstates exposure. Cite the 1,102-vs-20 and ~430-vs-8 numbers together; either alone misrepresents the problem in opposite directions. Confirmed offset-less exceptions worth checking first: `d4sign` (above), plus fallback branches in `nmi`, `whitebooks`, `frenet`, `daraz`, `cryptomathic-signer`.
- **~24 files carry a redundant local append-`Z` workaround** ahead of a datetime emit — the same pinning the shared helper now performs, harmless and correct but duplicated. `sugarcrm` has 5 separate per-file `toIso()` definitions (none delegating to `toIsoDatetime` — each appends `Z` and returns the raw string, so they skip the shared helper's normalisation/validation entirely); `insightly` has 5 (with the real bug above); one each is present in `privyid`, `tilaka`, `e-signature-eu`, `cielo`, `petpooja`, `usedesk`, `dex`, `pega-crm`. Two are near line-for-line reimplementations of the shared helper's exact pinning logic: `projects/adapters/suiteprojects-pro/transform/shared.ts:59-60` and `payments/adapters/cielo/transform/shared.ts:32-33`.

## 3. Minor-units inconsistencies between sibling files

Several accounting adapters convert decimal amounts to integer minor units in some transform files but pass them through raw in others, for the same platform:

- **128 sibling transform files across 16 adapters** pass at least one `Amount`-typed field straight through unconverted while a sibling file in the same adapter converts correctly — direct proof (the converting sibling) that the platform's API reports decimals. Per-adapter unconverted-file counts: bexio 8, center 8, freeagent 8, holded 8, invoicexpress 8, kashoo 8, lessaccounting 8, moloni 7, patriot 8, profitbooks 8, sellsy 8, stessa 8, sunrise 8, twinfield 8, xubio 9, zipbooks 8.
- **One of those is a fixture-corroborated proven bug** (the test fixture's own literal value has a genuine fractional part, so the bug is provable without external platform docs): `accounting/adapters/sunrise/transform/purchaseorder.ts`.
- **37 (adapter, raw-field-name) pairs** convert the same field in one file but not another within the same adapter — e.g. freeagent's `gross_value` is converted in `expense.ts` but passed through raw in `transaction.ts`. Grouped by adapter:
  - bexio: `tax_amount` (journal.ts, transaction.ts), `total_amount` (transaction.ts)
  - center: `taxAmount`, `total`
  - freeagent: `gross_value` (transaction.ts)
  - holded: `tax`, `total`
  - invoicexpress: `total`
  - kashoo: `tax_amount`, `total`
  - lessaccounting: `tax_amount`, `total_amount`
  - patriot: `tax_amount`, `total_amount`
  - profitbooks: `tax_amount`, `total_amount`
  - sellsy: `tax_amount`, `total_amount`
  - stessa: `taxAmount`, `total`
  - sunrise: `tax_amount`, `total_amount`
  - twinfield: `valueInc`, `vatValue`
  - xubio: `saldo` (bill/creditmemo/invoice.ts)
  - zipbooks: `tax_amount`, `total`
  - Outside those 16: **access-financials** (`gross`, `outstanding`, `tax`), **stampli** (`amount` — generic name, lower confidence), **wfirma** (`brutto`, `paid`, `remaining`, `tax` — inverted: converted in bill/creditmemo.ts, unconverted in invoice.ts)

A full-corpus heuristic scan (all 282 accounting adapters, 3,290 transform files) flags 2,107 files (64%) with at least one seemingly-unconverted `Amount` field, but that raw number is dominated by legitimate native-minor-units platforms and file-local re-implementations of the conversion under a different helper name — it is **not** a usable bug estimate on its own. The 128/1/37 figures above are the higher-confidence subset.

**`yooz/transform/bill.ts`'s `toNum()` is a bare cast, not a conversion.** It is a plain numeric cast (parseFloat/Number-equivalent), not a minor-units conversion. Its own test (`'emits float amounts that fail BillSchema'`) asserts `.toThrow()` and comments that this documents a known source mismatch — a live, self-documented bug with no owner (and, per §1, one the guard counts as compliant).

## 4. Per-adapter latent field-mapping bugs

- **Deskera CRM reads camelCase fields; its API returns snake_case.** Every transform file in `crm/adapters/deskera/transform/` reads camelCase raw field names (`closeDate`, `createdAt`, `stageId`, …), but Deskera's API returns snake_case, and `client.ts` performs no translation between the two — confirmed against Deskera's own API docs. Every field read this way is silently `undefined` in production.
- **MoySklad country codes are ISO-3166 numeric, and address country data is href-only unless expanded.** `Country.code` in MoySklad's API is ISO-3166-1 **numeric** (e.g. `'504'` = Morocco), not alpha-2/alpha-3; `toIso3166Alpha2` (`verticals/shared/iso-normalise.ts`) handles only alpha-form input, so a numeric code resolves to `undefined`. And `legalAddressFull.country` is href-only metadata in the default API response — no name/code inline unless the relation is explicitly expanded, and even then `name` comes back account-localised (e.g. `'Россия'`, not `'Russia'`). The adapter's current behaviour resolves to `undefined` for numeric-coded or unexpanded responses rather than emitting wrong data — the safe direction, but not a real fix.

## 5. NetSuite invoice currency — mitigated, not fixed

`accounting/adapters/netsuite/transform/invoice.ts` emits `raw.currency.refName` as the invoice's currency **only when it matches `/^[A-Z]{3}$/`**, and drops it otherwise. NetSuite returns the currency as a record reference in which *neither* member is dependably an ISO 4217 code: `id` is the currency record's **internal ID** (e.g. `'1'`, per Oracle's NetSuite REST record API docs — not the ISO code, despite what a fixture authored alongside the transform once suggested), and `refName` is the record's **display name** — usually the code, because that is how most accounts name their currency records, but `'US Dollar'` and localised names are equally legal. So a correctly-named account keeps its currency, and a renamed or localised currency record loses it rather than emitting a value the canonical schema (`/^[A-Z]{3}$/`) rejects — an absent optional field being the better failure, since nothing re-validates downstream (see the framing fact above).

The complete fix is resolving id → code from the currency record's `symbol` (or whichever field is confirmed to hold the ISO 4217 code) via NetSuite's `record/v1/currency/{id}` endpoint, cached per connection — or a maintained `id → ISO code` lookup table if the record IDs prove stable/enumerable per account (unconfirmed; custom currency lists are account-specific). Either approach needs verification against a real NetSuite sandbox or trustworthy secondary docs before implementation.

## 6. NetSuite: one declared wire type per resource, two incompatible fetch paths

Each NetSuite resource is fetched two ways with **no normalisation between them**, but has only one declared interface, so each is wrong on one of its two paths:

| Resource | `list*` | `get*` | Declares |
|---|---|---|---|
| invoice | SuiteQL, flat scalar columns | `record/v1/invoice/{id}`, nested `{id, refName}` | the **REST** shape |
| contact | SuiteQL | `record/v1/customer/{id}` | the **scalar** shape |
| account | SuiteQL | `record/v1/account/{id}` | the **scalar** shape |

`listInvoices` casts SuiteQL rows straight to `NetSuiteInvoice` and maps `transformInvoice` over them (`netsuite/index.ts:85-89`). The transform then does unguarded nested access: `raw.status.id`, `raw.entity.id`. Against a flat scalar column those read `undefined`, so `mapStatus` falls to `default` and **every invoice returned by the list endpoint reports `DRAFT`**, while `contactId` is silently lost. If a column comes back `null` — SuiteQL's normal representation of an empty foreign key — `raw.status.id` throws outright. `contact` and `account` have the mirror-image problem on their `get*` paths, where a REST reference object would be emitted into a field typed `string`.

**Why this stays unfixed, and what a fix needs.** The code reading above is direct and certain, but the claim that SuiteQL returns scalar internal IDs for these columns is standard behaviour that has **not** been verified against a live tenant: there is no NetSuite integration test and no recorded response anywhere in the repo (only `fortnox` and `easypost` have live fixtures), so nothing exercises real NetSuite wire data. Writing the fix without a captured response would mean deriving a platform's wire format from a fixture authored alongside the code it tests — the same self-referential-evidence trap that produced the currency bug in §5. Capture one `list` and one `get` response per resource first; the fix is then mechanical.

## 7. Evidence hygiene for adapter audits

Two standing rules, both earned the hard way, for anyone auditing or fixing adapters against this document:

- **Bulk-scaffolded doc comments and fixtures are not independent evidence.** A doc comment or test fixture authored in the same generation pass as the code it describes cannot corroborate that code's behaviour — it was produced by the same process, at the same time, from the same assumptions. This applies to every bulk-scaffolded adapter in the repo. Check the platform's own API documentation (or a captured live response) before treating an in-repo comment or fixture as confirmation.
- **A negative grep result is only as good as its pattern.** "No precedent exists in the codebase" is exactly the kind of conclusion to check twice before it blocks a fix — e.g. `grep -rn "currency_id\["` finds nothing when every sibling uses optional chaining (`raw.currency_id?.[1]`).

## 8. A cached row belongs to the raw-payload policy that was in force when it was written

`stripRawPayload` runs on **write** as well as read, and that is deliberate: the
flag (`DATA_STORE_RAW_PAYLOAD_{VERTICAL}`, off by default for `accounting` and
`payments`) is a data-minimisation control, not a display toggle. For accounting
the upstream payload IS `metadata`, and 17 adapters carry `iban` /
`bank_account` / `routing_number` in it — with the flag off those values must
never reach the cache at all, so stripping before the insert is the point.

The consequence is that a stored row is an artefact of whichever policy was
live when it was written, and the flag is a runtime setting an operator can flip
without a restart. One direction is safe: a row stored WITH the payload is
stripped on the way out once the policy says strip. The other has no protection.
A row stored WITHOUT the payload is served as-is when the policy later says
keep, so the same record can answer differently depending on whether the cache
happened to be warm.

That is what an MCP sweep reported as `list_invoices` carrying `metadata` while
`get_invoices` for the same record did not. Neither verb has a divergent
serialiser — both share one transform and one strip helper. What differs is
cache eligibility: `cachedList` refuses the cache whenever any query parameter
is present (`isQuerylessList`, and an agent always sends `limit`), so list
tended to be a fresh fetch under the current policy, while `cachedGet` has no
such gate and served a row written under an older one.

**Not fixed, deliberately.** The obvious repair — treat a payload-less cached
row as a miss — cannot tell "stripped at write" from "this record never had a
payload", and forces a permanent refetch on every record of the latter kind;
it breaks four legitimate cache-hit tests on contact. Distinguishing them needs
the policy recorded per row, i.e. a dual-backend migration. Weighed against a
rare, operator-initiated flag flip whose effect **self-heals on the next sync**,
that has not been judged worth the schema change yet.

What did change: the MCP client no longer discards `X-OpenSteward-Cache` and
`X-OpenSteward-Synced-At`. They surface as `meta.cache`, so a consumer seeing
two different answers for one record can at least tell which came from cache and
how old it was. Reach for the migration if the flag starts being flipped often.
