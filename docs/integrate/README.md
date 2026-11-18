# Integration guides

Per-platform setup walkthroughs for the OAuth dev-portal steps an operator
has to do BEFORE OpenSteward can hand a Connect Link to their customers.
One guide per platform that uses `auth_type: oauth2` or `oauth2_cc`.
Platforms on `api_key` / `session` / `local` don't need a dev-portal app
and have nothing to put here.

A guide is only worth writing when it carries content the generic
`/platforms/<vertical>/<platform>` config page can't: screenshots of the
dev portal, scope quirks, sandbox vs production hosts, subdomain handling,
partner-program gating, multi-auth paths, non-standard webhook signature
schemes. If none of that applies, don't write one — the catalog will show
the platform as "no guide yet" and that's the honest signal.

## Getting synced data out

Two guides here are not per-platform. They cover handing the records
OpenSteward has synced to your own tools:

- [Destinations](./destinations.md) — scheduled exports to Parquet on S3,
  GCS or Azure Blob, Iceberg-ready Parquet (experimental), or to Postgres,
  Snowflake, BigQuery and Databricks.
- [Read-only SQL access](./sql-access.md) — a read-only Postgres login
  for a BI tool or notebook, onto masked views (Postgres deployments only).

## Choosing what to write

Most adapters have no guide yet. The 80 existing guides (79
Semi-detailed + 1 Walkthrough-legacy) can be rewritten into
Walkthrough v2 opportunistically. Every other adapter is fair game for
authoring — start with the platforms your customers are connecting to
most.

## Structure

```
docs/integrate/
├── _template.md          ← copy + fill in for new guides
├── README.md             ← you are here
├── destinations.md       ← exports to your lake or warehouse
├── sql-access.md         ← read-only SQL logins
└── <vertical>/
    ├── index.md          ← vertical hub
    └── <platform>.md
```

`<vertical>` is one of `accounting` / `crm` / `customer-support` /
`docsign` / `ecommerce` / `inventory` / `logistics` / `payments` /
`projects`; `<platform>` matches the adapter slug exactly (must appear
in `docs/openapi/platform-slugs.json`).

## Writing a new guide

1. Copy `_template.md` to `<vertical>/<platform>.md`.
2. Replace the frontmatter placeholders. All required keys are listed
   in the template — `check:guides` fails CI if any are missing.
3. Walk the dev portal end-to-end with a real account; take screenshots
   along the way. Save under
   `docs/assets/screenshots/integrate/<vertical>/<platform>/`.
   Name them with a numeric prefix (`01-…`, `02-…`) so directory listings
   sort correctly.
4. Run `pnpm check:guides` before opening the PR.
5. Update `last_verified` whenever you re-walk the guide — quarterly at
   most.

## Formats

Three formats validate; **walkthrough-v2 is the canonical format
for new guides**:

- **walkthrough-v2** (canonical): `## Walkthrough` (numbered steps with
  screenshots) + `## Platform-specific notes` (bullets covering whatever
  differs from a generic OAuth flow). Optional `## Webhooks` and
  `## Troubleshooting` sections. See `_template.md`.
- **semi-detailed** (existing format, 79 guides): `## Auth model` plus
  free-form sections. Don't author new guides in this format; rewrite
  into walkthrough-v2 when you touch one.
- **walkthrough-legacy** (existing format, 1 guide): a six-section
  numbered template (`## 1. Prerequisites` … `## 6.
  Troubleshooting`). Same — rewrite into walkthrough-v2 when convenient.

The **Compact format** (`## Auth` + `## Webhooks` + `## Refused`) is
not accepted — guides in that shape fail validation.

## Voice

Maintainer-to-maintainer, plain-spoken. Active voice, sentence-case
headings, address the reader as "you". No "effortless / seamless /
revolutionary" marketing language. Each section earns its keep — if
there's nothing platform-specific to say, omit the bullet rather than
padding it.

Proper nouns stay cased: `Shopify`, `QuickBooks`, `Xero`, `OAuth`,
`Postgres`, `GitHub`. **OpenSteward** is always two words.

## Validation

```bash
pnpm check:guides
```

Asserts each guide:

- has all six required frontmatter keys — `vertical`, `platform`, `title`,
  `auth_type`, `estimated_time`, `last_verified` (`partner_program` and
  `written_by` are optional)
- declares a `vertical` matching the directory the file sits in
- satisfies one of the three accepted format schemas above
- references a real adapter slug (cross-checked against
  `docs/openapi/platform-slugs.json`)
- has a `last_verified` date that parses as `YYYY-MM-DD` (warns when > 180
  days old — a warning, not a failure)
- every screenshot path it embeds actually exists on disk

`index.md` hub pages are exempt from the frontmatter and heading checks.
`check:guides` chains into `check:docs`, so CI catches drift.

## Coverage

`/guides/integrate` on the docs-server lists every OAuth adapter — plus
any non-OAuth adapter that has a guide anyway — with its status:

- ✅ **Documented** — fresh guide (< 180 days)
- ⚠️ **Stale** — guide exists but `last_verified` is > 180 days old
- ❌ **Missing** — no guide yet
- 🤝 **Partner only** — frontmatter `partner_program: true` (operator
  needs to apply through the platform's partner programme before any
  production credentials issue)

`partner-only` wins over `stale`: a partner-gated guide keeps that pill
however old its `last_verified` is.
