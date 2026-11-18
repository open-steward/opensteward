/**
 * Every `ColumnSpec.get` on every in-memory admin table, pinned — 52
 * accessors across ten tables.
 *
 * WHY THIS FILE EXISTS. Plan 3's final review applied one technique across
 * the branch: change what a sort-map entry points at, run the suite, see
 * whether anything goes red. Almost nothing did. `/users`' `role` and
 * `created` could both be repointed at `u.username` with all 1260 admin tests
 * green, and the same held for most of the other fifty. None of the mappings
 * was wrong; a wrong one would simply have shipped.
 *
 * WHAT IT DOES NOT DO. It is deliberately not 52 bespoke tests. Those cost a
 * day, produce 52 fixtures that rot, and do nothing about the 53rd mapping
 * landing unpinned next month. Instead each table gets ONE fixture and a
 * declared expected order per sortable column, and three generic assertions
 * run over all of them:
 *
 *   1. COVERAGE. The sortable keys are read back out of the RENDERED table
 *      header (every sortable column emits a `?sort=<key>` link), and the set
 *      has to equal the set this file declares an expected order for. A
 *      column added to a TableSpec tomorrow appears in that header, matches
 *      nothing here, and fails — so a new mapping cannot land unpinned, and
 *      cannot be quietly parked in an opt-out list either.
 *   2. ORDER. `?sort=<key>&dir=asc` has to produce the declared order. The
 *      declared orders are pairwise distinct AND distinct from the table's
 *      unsorted order, which is asserted rather than assumed — that is the
 *      property that makes repointing ANY accessor at ANY other column in
 *      the same table observable, and it is the exact coincidence that hid
 *      `EndUserStore`'s `displayName` and `WebhookDeliveryStore`'s
 *      `eventType` (their fixtures ordered two columns identically, so
 *      swapping the two produced the expected answer).
 *   3. CELL PARITY. THE RULE THAT MATTERS MOST — a column's `get` must
 *      return what the CELL renders, because the same accessor serves the
 *      filter box. Checked as an ORDER property: for each column, the text
 *      of that column's cells, read in the order the page rendered the rows,
 *      must already be sorted. A `get` reading a different field orders the
 *      page by one column while the text of another is what gets sorted, and
 *      the two disagree.
 *
 * OPT-OUTS, and the two ways round them, both closed at the bottom of this
 * file. NINE columns cannot satisfy (3) and say so by name, each with the
 * reason its own route documents — a badge whose label reorders the raw
 * value, a composite cell, a count behind a list. They are still covered by
 * (1) and (2); the opt-out is only from the parity half, and two of the nine
 * are pinned exactly by declared values instead (see 'deliberate divergences'
 * below). That whole set is
 * pinned LITERALLY, not as a subset, because the obvious way to satisfy (1)
 * for a new column is to declare it and then park it in the opt-out list with
 * a plausible sentence. And the route files that build a `TableSpec` are
 * enumerated off disk with their per-file counts, because `TABLES` below is a
 * hand-written literal: without that, an eleventh admin table lands with no
 * coverage and nothing goes red.
 *
 * DATES AND LOCALE. Nine of the parity columns compare RENDERED dates
 * (`toLocaleDateString` / `toLocaleString`), so the comparison depends on how
 * the runtime formats them. Every such fixture keeps its rows inside one month
 * and differing only in the day, all single-digit or all two-digit, so the
 * ordering survives D/M/Y, M/D/Y and Y-M-D alike; and every timestamp is
 * `12:00:00.000Z`, so no UTC offset (±14 at the extreme) can roll a row onto a
 * different day. The order half, (2), does not depend on any of this.
 *
 * The four server-side tables order upstream and are pinned where that
 * ordering happens — see SERVER_SIDE_SPECS at the bottom of this file, which
 * names each one and its test.
 */
import type { FastifyInstance } from 'fastify'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Fixtures ────────────────────────────────────────────────────────────────
//
// Four rows per fixture — five for /connect-links and /connect-link-templates,
// whose composite accessors need a row a four-row fixture cannot carry — and
// every sortable column's ascending order is a different permutation of them.
// That distinctness is asserted per table ('orders the fixture differently for
// every column'), so a fixture edited into a coincidence fails loudly rather
// than silently voiding a column's test.

/** Shared by /tenants, and by the Tenant columns of four other tables — the
 *  ids below are the ones those tables' rows point at, and the NAMES are
 *  deliberately in the opposite order to the ids so a Tenant column that
 *  sorts on the resolved label cannot be confused with one that sorts on the
 *  raw id. */
const TENANTS = [
  { id: 't-charlie', name: 'Bravo Ltd' },
  { id: 't-alpha', name: 'Delta Ltd' },
  { id: 't-delta', name: 'Alpha Ltd' },
  { id: 't-bravo', name: 'Charlie Ltd' },
]

const USERS = [
  { id: 'u-1', username: 'delta', role: 'operator', createdAt: '2026-05-02T12:00:00.000Z' },
  { id: 'u-2', username: 'alpha', role: 'admin', createdAt: '2026-05-04T12:00:00.000Z' },
  { id: 'u-3', username: 'charlie', role: 'viewer', createdAt: '2026-05-01T12:00:00.000Z' },
  { id: 'u-4', username: 'bravo', role: 'admin', createdAt: '2026-05-03T12:00:00.000Z' },
]

const IDPS = [
  {
    id: 'idp-1',
    name: 'Delta SSO',
    protocol: 'saml',
    slug: 'sl-charlie',
    enabled: true,
    jitEnabled: false,
    defaultRole: 'operator',
  },
  {
    id: 'idp-2',
    name: 'Alpha SSO',
    protocol: 'oidc',
    slug: 'sl-delta',
    enabled: false,
    jitEnabled: true,
    defaultRole: 'admin',
  },
  {
    id: 'idp-3',
    name: 'Charlie SSO',
    protocol: 'ldap',
    slug: 'sl-alpha',
    enabled: false,
    jitEnabled: true,
    defaultRole: 'viewer',
  },
  {
    id: 'idp-4',
    name: 'Bravo SSO',
    protocol: 'saml',
    slug: 'sl-bravo',
    enabled: true,
    jitEnabled: false,
    defaultRole: 'admin',
  },
]

/** One issuer per authority mode plus a second `registry` one, so the
 *  Authority column has three distinct labels and a tie. `tenantCount` is
 *  derived in the route: from `allowedTenants` for the external issuer, and
 *  from a per-issuer detail fetch (ISSUER_DETAIL below) for the rest. */
const ISSUERS = [
  {
    id: 'iss-1',
    name: 'delta-idp',
    issuer: 'https://d.example/',
    authorityMode: 'registry' as const,
    tenantClaim: null,
    allowedTenants: [] as string[],
    enabled: true,
    lastVerifiedAt: '2026-06-02T12:00:00.000Z',
  },
  {
    id: 'iss-2',
    name: 'alpha-idp',
    issuer: 'https://a.example/',
    authorityMode: 'external' as const,
    tenantClaim: 'https://opensteward/tenant',
    allowedTenants: ['t-alpha', 't-bravo', 't-charlie'],
    enabled: false,
    lastVerifiedAt: '2026-06-04T12:00:00.000Z',
  },
  {
    id: 'iss-3',
    name: 'charlie-idp',
    issuer: 'https://c.example/',
    authorityMode: 'intersect' as const,
    tenantClaim: null,
    allowedTenants: [] as string[],
    enabled: false,
    lastVerifiedAt: '2026-06-01T12:00:00.000Z',
  },
  {
    id: 'iss-4',
    name: 'bravo-idp',
    issuer: 'https://b.example/',
    authorityMode: 'registry' as const,
    tenantClaim: null,
    allowedTenants: [] as string[],
    enabled: true,
    lastVerifiedAt: '2026-06-03T12:00:00.000Z',
  },
]

/** Service accounts per registry-mode issuer — one, four and two distinct
 *  tenants, so the Tenants column sorts 1, 2, 3 (the external issuer's
 *  allow-list), 4. */
const ISSUER_DETAIL: Record<string, { tenantId: string; revokedAt: null }[]> = {
  'iss-1': [{ tenantId: 't-alpha', revokedAt: null }],
  'iss-3': [
    { tenantId: 't-alpha', revokedAt: null },
    { tenantId: 't-bravo', revokedAt: null },
    { tenantId: 't-charlie', revokedAt: null },
    { tenantId: 't-delta', revokedAt: null },
  ],
  'iss-4': [
    { tenantId: 't-alpha', revokedAt: null },
    { tenantId: 't-bravo', revokedAt: null },
  ],
}

/**
 * Five rows, not four, because the Scope accessor needs three things a
 * four-row fixture cannot carry at once:
 *
 *   - a pinned platform whose SLUG orders differently from its
 *     `vertical:slug` form (`crm:zulu` sorts third, bare `zulu` sorts last),
 *     so dropping the `vertical:` half the cell renders is observable;
 *   - a row with TWO platforms, so the accessor has to map over all of them;
 *   - and a second row carrying only the first of that pair, so the two-platform
 *     row's value is a strict EXTENSION of it. A prefix always sorts before its
 *     extension, so truncating to `allowedPlatforms[0]` collapses the two into a
 *     tie and the stable sort puts them back in fixture order — the reverse of
 *     the expected one.
 *
 * The separator STRING is a fourth property, and ordering alone cannot see it
 * — not because it is unobservable (an earlier version of this comment claimed
 * that, wrongly), but because these two rows cannot see it: the joined value
 * is an extension of the first-platform-only value, so THAT PAIR orders the
 * same way whatever the separator is. A third row landing between the two
 * variants does expose it, and CLDR root collation would make `-` do the job.
 * It is pinned by equality instead — see 'composite accessors: the joined
 * value IS the cell text' below — which catches every separator rather than
 * the ones a particular collation happens to separate, and needs no reasoning
 * about ICU variable weighting to stay true.
 *
 * `oneTimeOnly` is false throughout: a true one appends a "One-time" badge to
 * the Label cell, which would put text in that cell the Label column does not
 * sort on.
 */
const CONNECT_SESSIONS = [
  {
    id: 's-1',
    token: 'tok-1',
    tenantId: 't-alpha',
    endUserId: 'cust-charlie',
    label: 'delta-link',
    allowedVerticals: [] as string[],
    // Two platforms, the first of them shared with s-5 below.
    allowedPlatforms: [
      { vertical: 'ecommerce', slug: 'alpha' },
      { vertical: 'logistics', slug: 'easypost' },
    ],
    redirectUrl: null,
    expiresAt: '2026-07-02T12:00:00.000Z',
    consumedAt: null,
    connectionId: null,
    createdAt: '2026-07-01T12:00:00.000Z',
    createdBy: null,
    status: 'active' as const,
    oneTimeOnly: false,
    url: 'https://example.com/connect/tok-1',
  },
  {
    id: 's-2',
    token: 'tok-2',
    tenantId: 't-delta',
    endUserId: 'cust-delta',
    label: 'alpha-link',
    allowedVerticals: ['accounting'],
    allowedPlatforms: [] as Array<{ vertical: string; slug: string }>,
    redirectUrl: null,
    expiresAt: '2026-07-04T12:00:00.000Z',
    consumedAt: null,
    connectionId: null,
    createdAt: '2026-07-01T12:00:00.000Z',
    createdBy: null,
    status: 'expired' as const,
    oneTimeOnly: false,
    url: 'https://example.com/connect/tok-2',
  },
  {
    id: 's-3',
    token: 'tok-3',
    tenantId: 't-charlie',
    // No customer — the row whose Customer cell reads "— anonymous" and whose
    // accessor falls back to that literal word. With `s.endUserId` alone it
    // would read as absent and sort LAST instead of first.
    endUserId: null as string | null,
    label: 'charlie-link',
    allowedVerticals: [] as string[],
    allowedPlatforms: [] as Array<{ vertical: string; slug: string }>,
    redirectUrl: null,
    expiresAt: '2026-07-01T12:00:00.000Z',
    consumedAt: '2026-07-02T12:00:00.000Z',
    connectionId: null,
    createdAt: '2026-07-01T12:00:00.000Z',
    createdBy: null,
    status: 'consumed' as const,
    oneTimeOnly: false,
    url: 'https://example.com/connect/tok-3',
  },
  {
    id: 's-4',
    token: 'tok-4',
    tenantId: 't-bravo',
    endUserId: 'cust-bravo',
    label: 'bravo-link',
    allowedVerticals: [] as string[],
    // `crm:zulu` sorts third; the bare slug `zulu` would sort LAST.
    allowedPlatforms: [{ vertical: 'crm', slug: 'zulu' }],
    redirectUrl: null,
    expiresAt: '2026-07-03T12:00:00.000Z',
    consumedAt: null,
    connectionId: null,
    createdAt: '2026-07-01T12:00:00.000Z',
    createdBy: null,
    status: 'active' as const,
    oneTimeOnly: false,
    url: 'https://example.com/connect/tok-4',
  },
  {
    id: 's-5',
    token: 'tok-5',
    // Shares s-3's tenant, so the Tenant column has a tie to break as well.
    tenantId: 't-charlie',
    endUserId: 'cust-alpha',
    label: 'echo-link',
    allowedVerticals: [] as string[],
    // Exactly s-1's FIRST platform, and nothing else.
    allowedPlatforms: [{ vertical: 'ecommerce', slug: 'alpha' }],
    redirectUrl: null,
    expiresAt: '2026-07-05T12:00:00.000Z',
    consumedAt: null,
    connectionId: null,
    createdAt: '2026-07-01T12:00:00.000Z',
    createdBy: null,
    status: 'expired' as const,
    oneTimeOnly: false,
    url: 'https://example.com/connect/tok-5',
  },
]
/**
 * Five rows. Three carry a description and/or a pinned platform, because the
 * Name column's accessor (`nameCellText`) is the concatenation of all three
 * parts and the cell renders all three — and the fifth uses the
 * `allowedVerticals` branch, which had no coverage at all (deleting that
 * branch left the whole file green).
 *
 * That fifth row is also why Name is on the parity opt-out list: the cell
 * renders `vertical: payments` where the accessor returns `payments`. Leaving
 * the decorator word out of the accessor is deliberate — matching it would
 * make one keyword return every single-vertical template — so the divergence
 * is recorded here rather than only in prose.
 */
const CONNECT_TEMPLATES = [
  {
    id: 1,
    tenantId: 'tp-charlie',
    name: 'Delta template',
    description: 'zulu notes',
    linkMode: 'pinned' as const,
    allowedVerticals: [] as string[],
    allowedPlatforms: [{ vertical: 'crm', slug: 'nutshell' }],
    scopeGroupId: 3,
    expiryDays: 1,
    oneTimeOnly: true,
    redirectUrl: null,
    createdAt: '2026-04-04T12:00:00.000Z',
    createdBy: null,
  },
  {
    id: 2,
    tenantId: 'tp-delta',
    name: 'Alpha template',
    description: null,
    linkMode: 'self-register' as const,
    allowedVerticals: [] as string[],
    allowedPlatforms: [] as Array<{ vertical: string; slug: string }>,
    scopeGroupId: 1,
    expiryDays: 3,
    oneTimeOnly: false,
    redirectUrl: null,
    createdAt: '2026-04-02T12:00:00.000Z',
    createdBy: null,
  },
  {
    id: 3,
    tenantId: 'tp-alpha',
    name: 'Charlie template',
    description: 'yankee notes',
    linkMode: 'customer-picks-adapter' as const,
    allowedVerticals: [] as string[],
    allowedPlatforms: [] as Array<{ vertical: string; slug: string }>,
    scopeGroupId: 4,
    expiryDays: 2,
    oneTimeOnly: false,
    redirectUrl: null,
    createdAt: '2026-04-03T12:00:00.000Z',
    createdBy: null,
  },
  {
    id: 4,
    tenantId: 'tp-bravo',
    name: 'Bravo template',
    description: null,
    linkMode: 'pinned' as const,
    allowedVerticals: [] as string[],
    allowedPlatforms: [{ vertical: 'ecommerce', slug: 'shopify' }],
    scopeGroupId: 2,
    expiryDays: 4,
    oneTimeOnly: true,
    redirectUrl: null,
    createdAt: '2026-04-01T12:00:00.000Z',
    createdBy: null,
  },
  {
    id: 5,
    tenantId: 'tp-echo',
    name: 'Echo template',
    description: null,
    linkMode: 'self-register' as const,
    // The single-vertical branch of `nameCellText`, and of the cell.
    allowedVerticals: ['payments'],
    allowedPlatforms: [] as Array<{ vertical: string; slug: string }>,
    scopeGroupId: 5,
    expiryDays: 5,
    oneTimeOnly: false,
    redirectUrl: null,
    createdAt: '2026-04-05T12:00:00.000Z',
    createdBy: null,
  },
]

/**
 * `/platforms` rows arrive one vertical at a time and are flattened in
 * KNOWN_VERTICALS order, so the four verticals here are chosen from the part
 * of that list where declaration order and alphabetical order disagree
 * (`payments` is declared before `docsign`). Without that, the Vertical
 * column's ascending order would BE the unsorted order and the test could not
 * tell a working sort from no sort at all.
 */
const PLATFORM_ROWS: Record<
  string,
  Array<{ slug: string; enabled: boolean; hasConfig: boolean }>
> = {
  payments: [{ slug: 'pl-charlie', enabled: false, hasConfig: true }],
  docsign: [{ slug: 'pl-alpha', enabled: true, hasConfig: false }],
  projects: [{ slug: 'pl-delta', enabled: false, hasConfig: false }],
  'customer-support': [{ slug: 'pl-bravo', enabled: true, hasConfig: true }],
}

/** Connection counts for the Connections column: 1, 4, 2, 3 across the four
 *  platform rows above. `status` is never `platform_error`, which would add a
 *  "Creds invalid" badge to the Configured cell. */
const PLATFORM_CONNECTIONS = [
  { id: 'x1', vertical: 'payments', platform: 'pl-charlie', status: 'valid' },
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `x2-${i}`,
    vertical: 'docsign',
    platform: 'pl-alpha',
    status: 'valid',
  })),
  ...Array.from({ length: 2 }, (_, i) => ({
    id: `x3-${i}`,
    vertical: 'projects',
    platform: 'pl-delta',
    status: 'valid',
  })),
  ...Array.from({ length: 3 }, (_, i) => ({
    id: `x4-${i}`,
    vertical: 'customer-support',
    platform: 'pl-bravo',
    status: 'valid',
  })),
]

const SCOPE_GROUPS = [
  {
    id: 1,
    vertical: 'payments',
    platform: 'pf-charlie',
    name: 'sg-delta',
    scopes: ['s:a', 's:b', 's:c'],
    createdAt: '2026-03-02T12:00:00.000Z',
  },
  {
    id: 2,
    vertical: 'crm',
    platform: 'pf-delta',
    name: 'sg-alpha',
    scopes: ['s:a'],
    createdAt: '2026-03-04T12:00:00.000Z',
  },
  {
    id: 3,
    vertical: 'accounting',
    platform: 'pf-alpha',
    name: 'sg-charlie',
    scopes: ['s:a', 's:b', 's:c', 's:d'],
    createdAt: '2026-03-01T12:00:00.000Z',
  },
  {
    id: 4,
    vertical: 'logistics',
    platform: 'pf-bravo',
    name: 'sg-bravo',
    scopes: ['s:a', 's:b'],
    createdAt: '2026-03-03T12:00:00.000Z',
  },
]

/** One key per Status state the cell can render, INCLUDING the "Rotating out"
 *  one (`revokeAt` set) that `keyStatus` deliberately folds into 'active' —
 *  which is why Status is on the parity opt-out list below. `expiresAt` is
 *  epoch ms: the cell compares it against `Date.now()` numerically. */
const API_KEYS = [
  {
    id: 'k-1',
    tenantId: 't-charlie',
    mode: 'live' as const,
    prefix: 'osk_delta',
    // No label. The cell falls back to the prefix and so does the accessor —
    // `k.label` alone would read as absent and sort this row LAST rather than
    // second. A key minted straight against the API has no label.
    label: null as string | null,
    scopes: ['accounting:read'],
    createdAt: '2026-02-01T12:00:00.000Z',
    lastUsedAt: '2026-02-13T12:00:00.000Z',
    revokedAt: '2026-02-20T12:00:00.000Z',
    revokeAt: null,
    expiresAt: null,
  },
  {
    id: 'k-2',
    tenantId: 't-delta',
    mode: 'test' as const,
    prefix: 'osk_alpha',
    label: 'zed-delta',
    scopes: ['crm:read'],
    createdAt: '2026-02-03T12:00:00.000Z',
    lastUsedAt: '2026-02-12T12:00:00.000Z',
    revokedAt: null,
    revokeAt: null,
    expiresAt: Date.parse('2026-01-01T00:00:00.000Z'),
  },
  {
    id: 'k-3',
    tenantId: 't-alpha',
    // No `mode` at all — the shape an older admin-api sends. The cell reads
    // "Live" for it and the accessor has to agree; `k.mode` would be
    // `undefined` and drop the row out of the Mode column entirely.
    prefix: 'osk_charlie',
    label: 'key-alpha',
    scopes: ['*'],
    createdAt: '2026-02-04T12:00:00.000Z',
    lastUsedAt: '2026-02-14T12:00:00.000Z',
    revokedAt: null,
    revokeAt: null,
    expiresAt: null,
  },
  {
    id: 'k-4',
    tenantId: 't-bravo',
    mode: 'test' as const,
    prefix: 'osk_bravo',
    label: 'zed-charlie',
    scopes: ['ecommerce:read'],
    createdAt: '2026-02-02T12:00:00.000Z',
    lastUsedAt: '2026-02-11T12:00:00.000Z',
    revokedAt: null,
    revokeAt: Date.parse('2099-01-01T00:00:00.000Z'),
    expiresAt: null,
  },
]

/**
 * The `format` slugs and their labels are deliberately in DIFFERENT orders
 * (slug: flat, opensteward, slack, teams; label: Flat JSON, Microsoft Teams,
 * OpenSteward envelope, Slack), which is what makes the Delivery column's
 * `formatLabel` accessor distinguishable from the raw `format` it replaced.
 * `paused` is false throughout: a paused row appends a badge to the Tenant
 * cell, which that column does not sort on.
 */
const WEBHOOKS = [
  {
    id: 'wh-1',
    tenantId: 't-bravo',
    url: 'https://c.example/hook',
    label: 'wh-delta',
    events: ['*'],
    paused: false,
    createdAt: '2026-08-04T12:00:00.000Z',
    lastFiredAt: '2026-08-01T12:00:00.000Z',
    lastStatus: 200,
    lastError: null,
    format: 'teams',
  },
  {
    id: 'wh-2',
    tenantId: 't-delta',
    url: 'https://d.example/hook',
    label: 'wh-alpha',
    events: ['*'],
    paused: false,
    createdAt: '2026-08-02T12:00:00.000Z',
    lastFiredAt: '2026-08-03T12:00:00.000Z',
    lastStatus: 500,
    lastError: null,
    format: 'flat',
  },
  {
    id: 'wh-3',
    tenantId: 't-alpha',
    url: 'https://a.example/hook',
    // No label — the cell reads "Unnamed" and so must the accessor, or the
    // row drops out of the Label column and sorts last instead of first.
    label: null as string | null,
    events: ['*'],
    paused: false,
    createdAt: '2026-08-03T12:00:00.000Z',
    lastFiredAt: '2026-08-02T12:00:00.000Z',
    lastStatus: null,
    lastError: null,
    format: 'slack',
  },
  {
    id: 'wh-4',
    tenantId: 't-charlie',
    url: 'https://b.example/hook',
    label: 'wh-bravo',
    events: ['*'],
    paused: false,
    createdAt: '2026-08-01T12:00:00.000Z',
    lastFiredAt: '2026-08-04T12:00:00.000Z',
    lastStatus: null,
    lastError: null,
    // No `format` — the fallback to 'opensteward'/'OpenSteward envelope'.
  },
]

/**
 * /data's rows, as `listDataConnections` returns them. `data-bravo` has no
 * label, so its Label cell (and accessor) falls back to the platform — which
 * is why its platform reads `data-bravo`. Tenants are assigned so the NAME
 * order (D, C, B, A) differs from the id order (A, B, C, D, which is also the
 * Label order): a Tenant column sorting on the raw id would answer Label's
 * order. Each row's FIRST resource type is distinct, since Resource types
 * sorts on the joined names and its cell renders them in that order. Totals
 * stay under 1,000 so the Records cell has no separator to read as text.
 */
const sept = (d: number) => Date.parse(`2026-09-0${d}T12:00:00.000Z`)
const dataResource = (resourceType: string, count: number, latest: number) => ({
  resourceType,
  count,
  latestChangedAt: latest,
  collectionCompletedAt: null,
  classified: true,
})
const DATA_CONNECTIONS = [
  {
    connectionId: 'c-3',
    vertical: 'crm',
    platform: 'pf-b',
    label: 'data-delta',
    ownerTenantId: 't-delta',
    resources: [dataResource('bills', 25, sept(1)), dataResource('notes', 15, sept(1))],
  },
  {
    connectionId: 'c-2',
    vertical: 'ecommerce',
    platform: 'pf-a',
    label: 'data-alpha',
    ownerTenantId: 't-alpha',
    resources: [dataResource('invoices', 10, sept(3))],
  },
  {
    connectionId: 'c-1',
    vertical: 'logistics',
    platform: 'pf-c',
    label: 'data-charlie',
    ownerTenantId: 't-charlie',
    resources: [dataResource('accounts', 12, sept(2)), dataResource('orders', 8, sept(4))],
  },
  {
    connectionId: 'c-4',
    vertical: 'accounting',
    platform: 'data-bravo',
    label: null as string | null,
    ownerTenantId: 't-bravo',
    resources: [dataResource('contacts', 30, sept(2))],
  },
]

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      hasUsers: async () => true,
      listUsers: async () => USERS,
      listTenants: async () => TENANTS,
      listTenantDomains: async () => [],
      listIdentityProviders: async () => IDPS,
      listOAuthIssuers: async () => ISSUERS,
      getOAuthReadiness: async () => ({ ready: true, reason: 'ok' }),
      getOAuthIssuer: async (_token: string, id: string) => {
        const issuer = ISSUERS.find((i) => i.id === id)
        if (!issuer) return null
        return { issuer, clients: ISSUER_DETAIL[id] ?? [], rules: [] }
      },
      listConnectSessions: async () => CONNECT_SESSIONS,
      listConnectLinkTemplates: async () => CONNECT_TEMPLATES,
      getCompanyInfo: async () => null,
      listScopeGroups: async () => SCOPE_GROUPS,
      listCatalog: async () => [
        { vertical: 'accounting', slug: 'pf-alpha', name: 'Alpha' },
        { vertical: 'logistics', slug: 'pf-bravo', name: 'Bravo' },
      ],
      listApiKeys: async () => API_KEYS,
      listWebhookSubs: async () => WEBHOOKS,
      listPlatforms: async (_token: string, vertical: string) => PLATFORM_ROWS[vertical] ?? [],
      listConnections: async () => PLATFORM_CONNECTIONS,
      listDataConnections: async () => DATA_CONNECTIONS,
    }),
  }
})

const { buildServer } = await import('../../src/core/server')
// The two specs whose accessors concatenate several parts of their cell. Read
// through a dynamic import for the same reason `buildServer` is: `vi.mock` is
// hoisted above this file's static imports, and these route modules pull in
// the client it replaces.
const { CONNECT_LINKS_TABLE } = await import('../../src/core/routes/connect-links')
const { OAUTH_TABLE } = await import('../../src/core/routes/oauth-clients')
const { TEMPLATES_TABLE } = await import('../../src/core/routes/connect-link-templates')

const SESSION_SECRET = 'sort-key-cell-parity-secret-long-enough'
let fastify: FastifyInstance

beforeEach(async () => {
  const built = await buildServer({
    server: { port: 0, host: '127.0.0.1' },
    session: { secret: SESSION_SECRET },
    admin_api: { url: 'http://localhost:3001' },
    docs_server: { url: 'http://localhost:3003' },
    sso: { publicBaseUrl: 'http://localhost:3000' },
  })
  fastify = built.fastify
  await fastify.ready()
})

afterEach(async () => {
  await fastify?.close()
  vi.clearAllMocks()
})

async function fetchPage(url: string): Promise<string> {
  const session = fastify.signCookie(
    JSON.stringify({ id: 'admin-1', username: 'admin', role: 'admin', token: 'jwt' }),
  )
  const res = await fastify.inject({ method: 'GET', url, cookies: { session } })
  expect(res.statusCode, `GET ${url}`).toBe(200)
  return res.body
}

// ── Reading a rendered table back ───────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
  '&rarr;': '→',
  '&mdash;': '—',
}

/** Visible text of an HTML fragment: tags stripped, entities decoded,
 *  whitespace collapsed. This is what an operator reads in the cell, which is
 *  the thing THE RULE says the column's `get` has to agree with. */
function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The `<table>` a given filter form belongs to.
 *
 * `_table-filters-form.ejs` renders `<form id="<spec.id>">` immediately before
 * the table it drives (it cannot be nested inside one — see that partial), so
 * the first `<table>` after that id is the right one. Anchoring on the form id
 * rather than on "the first table on the page" matters for /platforms, whose
 * Browse tab renders its own markup above this one.
 */
function tableOf(body: string, formId: string): string {
  const anchor = body.indexOf(`id="${formId}"`)
  expect(anchor, `no filter form with id="${formId}"`).toBeGreaterThan(-1)
  const start = body.indexOf('<table', anchor)
  const end = body.indexOf('</table>', start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return body.slice(start, end)
}

/**
 * The rendered header row, as one entry per `<th>` in the order they appear:
 * the sort key when the column is sortable, `null` when it is not.
 *
 * Read out of the HTML rather than imported from the route's TableSpec on
 * purpose. The specs are module-private, but more importantly this is the
 * only reading that makes the coverage assertion mean anything: it is the
 * columns the operator can actually click that have to be accounted for.
 */
function headerKeys(table: string): Array<string | null> {
  // From `<thead` to the end of its FIRST row — the second row is the filter
  // controls, which carry no sort links but do carry `<th>`s.
  const head = table.slice(table.indexOf('<thead'), table.indexOf('</tr>', table.indexOf('<thead')))
  return [...head.matchAll(/<th[^>]*>([\s\S]*?)(?=<\/th>)/g)].map(
    (m) => m[1].match(/[?&]sort=([^&"]+)/)?.[1] ?? null,
  )
}

/** One entry per body row, each the list of its cells' visible text. */
function rowCells(table: string): string[][] {
  const start = table.indexOf('<tbody')
  const body = table.slice(start, table.indexOf('</tbody>', start))
  return [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((row) =>
    [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => text(cell[1])),
  )
}

/** Ascending comparator matching `applyTableQuery`'s: numeric when every
 *  value in the column is a number, otherwise a base-sensitivity locale
 *  compare (so 'OIDC' and 'oidc' order the same way). */
function sortedTexts(values: string[]): string[] {
  const numeric = values.every((v) => v !== '' && Number.isFinite(Number(v)))
  return [...values].sort((a, b) =>
    numeric ? Number(a) - Number(b) : a.localeCompare(b, undefined, { sensitivity: 'base' }),
  )
}

// ── The tables ──────────────────────────────────────────────────────────────

interface TableCase {
  /** Basename of the route file that builds this table's TableSpec. Used by
   *  the enumeration at the bottom of this file, so the covered set is derived
   *  from these cases rather than hand-listed a second time. */
  route: string
  /** Page URL with no sort applied. May already carry query params. */
  url: string
  /** DOM id of the filter form, which locates the table on the page. */
  formId: string
  /** How a row is named in `order`/`unsorted`, from its cells' text. Usually
   *  one whole cell; /oauth-clients takes the first word of a composite one. */
  rowId: (cells: string[]) => string
  /** The unsorted order — every entry in `order` has to differ from it, or a
   *  dropped sort would answer what a working one does. */
  unsorted: string[]
  /** Ascending order per sortable key. Must cover EVERY sortable column. */
  order: Record<string, string[]>
  /** Columns exempt from the cell-parity check, with the reason. */
  parityExempt?: Record<string, string>
}

const TABLES: Record<string, TableCase> = {
  '/users': {
    route: 'users.ts',
    url: '/users',
    formId: 'users-filters',
    rowId: (c) => c[0],
    unsorted: ['delta', 'alpha', 'charlie', 'bravo'],
    order: {
      username: ['alpha', 'bravo', 'charlie', 'delta'],
      // Two admins tie; a stable sort keeps them in fixture order.
      role: ['alpha', 'bravo', 'delta', 'charlie'],
      created: ['charlie', 'delta', 'bravo', 'alpha'],
    },
  },

  '/tenants': {
    route: 'tenants.ts',
    url: '/tenants',
    formId: 'tenants-filters',
    rowId: (c) => c[1],
    unsorted: ['t-charlie', 't-alpha', 't-delta', 't-bravo'],
    order: {
      // Name order and id order are deliberate inverses of each other.
      tenant: ['t-delta', 't-charlie', 't-bravo', 't-alpha'],
      id: ['t-alpha', 't-bravo', 't-charlie', 't-delta'],
    },
  },

  '/identity-providers': {
    route: 'identity-providers.ts',
    url: '/identity-providers',
    formId: 'idp-filters',
    rowId: (c) => c[2],
    unsorted: ['sl-charlie', 'sl-delta', 'sl-alpha', 'sl-bravo'],
    order: {
      name: ['sl-delta', 'sl-bravo', 'sl-alpha', 'sl-charlie'],
      protocol: ['sl-alpha', 'sl-delta', 'sl-charlie', 'sl-bravo'],
      slug: ['sl-alpha', 'sl-bravo', 'sl-charlie', 'sl-delta'],
      status: ['sl-delta', 'sl-alpha', 'sl-charlie', 'sl-bravo'],
      jit: ['sl-charlie', 'sl-bravo', 'sl-delta', 'sl-alpha'],
      role: ['sl-delta', 'sl-bravo', 'sl-charlie', 'sl-alpha'],
    },
  },

  '/oauth-clients': {
    route: 'oauth-clients.ts',
    url: '/oauth-clients',
    formId: 'oauth-filters',
    // The Issuer cell renders the display name AND the issuer URL under it —
    // the composite this column deliberately sorts and filters on. The name
    // alone is enough to name the row.
    rowId: (c) => c[0].split(' ')[0],
    unsorted: ['delta-idp', 'alpha-idp', 'charlie-idp', 'bravo-idp'],
    order: {
      issuer: ['alpha-idp', 'bravo-idp', 'charlie-idp', 'delta-idp'],
      // 'Registry' (twice), 'Registry ∩ token', 'Token decides'.
      authority: ['delta-idp', 'bravo-idp', 'charlie-idp', 'alpha-idp'],
      tenants: ['delta-idp', 'bravo-idp', 'alpha-idp', 'charlie-idp'],
      verified: ['charlie-idp', 'delta-idp', 'bravo-idp', 'alpha-idp'],
      status: ['alpha-idp', 'charlie-idp', 'delta-idp', 'bravo-idp'],
    },
    parityExempt: {
      tenants:
        'the cell renders a tenant LIST (or one of three badges); the column sorts on how many, which is the only scalar behind it',
      status:
        'the cell is a badge reading Active / Untested / Disabled, derived from `enabled` AND `lastVerifiedAt`; the column sorts on `enabled` alone',
    },
  },

  '/connect-links': {
    route: 'connect-links.ts',
    url: '/connect-links',
    formId: 'links-filters',
    rowId: (c) => c[0],
    unsorted: ['delta-link', 'alpha-link', 'charlie-link', 'bravo-link', 'echo-link'],
    order: {
      label: ['alpha-link', 'bravo-link', 'charlie-link', 'delta-link', 'echo-link'],
      // The anonymous row first: 'anonymous' < 'cust-…'.
      customer: ['charlie-link', 'echo-link', 'bravo-link', 'delta-link', 'alpha-link'],
      // Sorted on the resolved "<name> <id>" label, so this is NOT the
      // tenant-id order (which would be delta, bravo, charlie, echo, alpha).
      // charlie-link and echo-link share a tenant and tie, so the stable sort
      // keeps them in fixture order.
      tenant: ['alpha-link', 'charlie-link', 'echo-link', 'bravo-link', 'delta-link'],
      // 'accounting' < 'any' < 'crm:zulu' < 'ecommerce:alpha' <
      // 'ecommerce:alpha, logistics:easypost'. NOT the bare-slug order
      // (accounting, alpha…, alpha, any, zulu), and echo-link before
      // delta-link is what a first-platform-only accessor cannot produce.
      scope: ['alpha-link', 'charlie-link', 'bravo-link', 'echo-link', 'delta-link'],
      status: ['delta-link', 'bravo-link', 'charlie-link', 'alpha-link', 'echo-link'],
      expires: ['charlie-link', 'delta-link', 'bravo-link', 'alpha-link', 'echo-link'],
    },
    parityExempt: {
      status:
        'the cell reads Active / Used / Expired, and "Used" (for `consumed`) sorts after "Expired" where the raw values sort the other way round',
      customer:
        'the cell prefixes an emoji and truncates to eight characters, or reads "— anonymous"; the accessor keeps the whole id so a pasted one still matches',
    },
  },

  '/connect-link-templates': {
    route: 'connect-link-templates.ts',
    url: '/connect-link-templates',
    formId: 'templates-filters',
    rowId: (c) => c[0],
    unsorted: ['tp-charlie', 'tp-delta', 'tp-alpha', 'tp-bravo', 'tp-echo'],
    order: {
      tenant: ['tp-alpha', 'tp-bravo', 'tp-charlie', 'tp-delta', 'tp-echo'],
      name: ['tp-delta', 'tp-bravo', 'tp-alpha', 'tp-charlie', 'tp-echo'],
      mode: ['tp-alpha', 'tp-charlie', 'tp-bravo', 'tp-delta', 'tp-echo'],
      scope: ['tp-delta', 'tp-bravo', 'tp-charlie', 'tp-alpha', 'tp-echo'],
      expiry: ['tp-charlie', 'tp-alpha', 'tp-delta', 'tp-bravo', 'tp-echo'],
      onetime: ['tp-delta', 'tp-alpha', 'tp-echo', 'tp-charlie', 'tp-bravo'],
      created: ['tp-bravo', 'tp-delta', 'tp-alpha', 'tp-charlie', 'tp-echo'],
    },
    parityExempt: {
      name: 'the cell prefixes "vertical: " on a single-vertical template, which the accessor deliberately omits — matching that decorator word would make one keyword return every single-vertical template',
    },
  },

  '/platforms': {
    route: 'platforms.ts',
    // `status=all` because the Configure tab defaults to `configured`, which
    // would hide the two rows the Configured column needs to be sortable at
    // all. Both params ride `preserve`, so the sort links carry them.
    url: '/platforms?tab=configure&status=all',
    formId: 'platforms-filters',
    rowId: (c) => c[0],
    unsorted: ['pl-charlie', 'pl-alpha', 'pl-delta', 'pl-bravo'],
    order: {
      platform: ['pl-alpha', 'pl-bravo', 'pl-charlie', 'pl-delta'],
      vertical: ['pl-bravo', 'pl-alpha', 'pl-charlie', 'pl-delta'],
      enabled: ['pl-charlie', 'pl-delta', 'pl-alpha', 'pl-bravo'],
      configured: ['pl-alpha', 'pl-delta', 'pl-charlie', 'pl-bravo'],
      connections: ['pl-charlie', 'pl-delta', 'pl-bravo', 'pl-alpha'],
    },
    parityExempt: {
      enabled:
        'the cell is an "Enabled" badge or an em-dash, never the raw yes/no the column sorts on',
      configured:
        'the cell is a "Configured" badge or an em-dash, plus a separate "Creds invalid" badge, never the raw yes/no',
    },
  },

  '/scope-groups': {
    route: 'scope-groups.ts',
    url: '/scope-groups',
    formId: 'scope-groups-filters',
    rowId: (c) => c[2],
    unsorted: ['sg-delta', 'sg-alpha', 'sg-charlie', 'sg-bravo'],
    order: {
      vertical: ['sg-charlie', 'sg-alpha', 'sg-bravo', 'sg-delta'],
      platform: ['sg-charlie', 'sg-bravo', 'sg-delta', 'sg-alpha'],
      name: ['sg-alpha', 'sg-bravo', 'sg-charlie', 'sg-delta'],
      scopes: ['sg-alpha', 'sg-bravo', 'sg-delta', 'sg-charlie'],
      created: ['sg-charlie', 'sg-delta', 'sg-bravo', 'sg-alpha'],
    },
    parityExempt: {
      scopes: 'the cell lists the scope NAMES one per line; the column sorts on how many there are',
    },
  },

  '/api-keys': {
    route: 'api-keys.ts',
    url: '/api-keys',
    formId: 'api-keys-filters',
    rowId: (c) => c[3],
    unsorted: ['osk_delta', 'zed-delta', 'key-alpha', 'zed-charlie'],
    order: {
      tenant: ['key-alpha', 'zed-charlie', 'osk_delta', 'zed-delta'],
      // Both 'live' keys first — including the one with no `mode` field.
      mode: ['osk_delta', 'key-alpha', 'zed-delta', 'zed-charlie'],
      prefix: ['zed-delta', 'zed-charlie', 'key-alpha', 'osk_delta'],
      // The unlabelled key sorts on its prefix, between 'key-…' and 'zed-…'.
      label: ['key-alpha', 'osk_delta', 'zed-charlie', 'zed-delta'],
      status: ['key-alpha', 'zed-charlie', 'zed-delta', 'osk_delta'],
      created: ['osk_delta', 'zed-charlie', 'zed-delta', 'key-alpha'],
      lastUsed: ['zed-charlie', 'zed-delta', 'osk_delta', 'key-alpha'],
    },
    parityExempt: {
      status:
        'the cell has a fourth state ("Rotating out", from `revokeAt`) that `keyStatus` folds into `active` — a documented simplification allowed because Status carries no filter box',
    },
  },

  '/data': {
    route: 'data.ts',
    url: '/data',
    formId: 'data-filters',
    rowId: (c) => c[0],
    unsorted: ['data-delta', 'data-alpha', 'data-charlie', 'data-bravo'],
    order: {
      // data-bravo's Label cell is its platform, so it still sorts second.
      label: ['data-alpha', 'data-bravo', 'data-charlie', 'data-delta'],
      id: ['data-charlie', 'data-alpha', 'data-delta', 'data-bravo'],
      vertical: ['data-bravo', 'data-delta', 'data-alpha', 'data-charlie'],
      // By tenant NAME — the raw-id order would be Label's.
      tenant: ['data-delta', 'data-charlie', 'data-bravo', 'data-alpha'],
      platform: ['data-bravo', 'data-alpha', 'data-delta', 'data-charlie'],
      resources: ['data-charlie', 'data-delta', 'data-bravo', 'data-alpha'],
      records: ['data-alpha', 'data-charlie', 'data-bravo', 'data-delta'],
      // The NEWEST change across a row's types: data-charlie's orders (4 Sept)
      // beat its accounts (2 Sept), so it sorts last, not tied second.
      lastChange: ['data-delta', 'data-bravo', 'data-alpha', 'data-charlie'],
    },
    parityExempt: {
      lastChange:
        'the cell is relative ("17 h ago"), which does not sort as text; the column sorts on the timestamp behind it and carries no filter box',
    },
  },

  '/webhooks': {
    route: 'webhooks.ts',
    url: '/webhooks',
    formId: 'webhooks-filters',
    rowId: (c) => c[0],
    unsorted: ['wh-delta', 'wh-alpha', 'Unnamed', 'wh-bravo'],
    order: {
      label: ['Unnamed', 'wh-alpha', 'wh-bravo', 'wh-delta'],
      tenant: ['Unnamed', 'wh-delta', 'wh-bravo', 'wh-alpha'],
      // NOT ['wh-alpha', 'wh-bravo', 'wh-delta', 'Unnamed']: that is what
      // repointing this accessor at `s.label` answers, because the unlabelled
      // row then reads as absent and sorts last. The URLs are assigned so the
      // two orders differ — the sweep caught this exact coincidence.
      url: ['Unnamed', 'wh-bravo', 'wh-delta', 'wh-alpha'],
      // Sorted on the format LABEL, so this is not the `format` slug order
      // (which would be wh-alpha, Unnamed, wh-delta, wh-bravo — the last row
      // has no `format` field at all, so under the raw slug it reads as absent
      // and sorts last rather than second).
      delivery: ['wh-alpha', 'wh-delta', 'wh-bravo', 'Unnamed'],
      lastDelivery: ['wh-delta', 'Unnamed', 'wh-alpha', 'wh-bravo'],
      created: ['wh-bravo', 'wh-alpha', 'Unnamed', 'wh-delta'],
    },
  },
}

const CASES = Object.entries(TABLES).map(([name, spec]) => ({ name, spec }))

describe.each(CASES)('$name — every sortable column', ({ name, spec }) => {
  const identities = (body: string) => rowCells(tableOf(body, spec.formId)).map(spec.rowId)

  const sorted = (key: string) =>
    fetchPage(`${spec.url}${spec.url.includes('?') ? '&' : '?'}sort=${key}&dir=asc`)

  /**
   * The assertion that makes the rest of this file exhaustive rather than
   * representative: the sortable columns are whatever the page renders a sort
   * link for, and every one of them has to be declared above.
   */
  it('declares an expected order for exactly the columns the page offers to sort', async () => {
    const keys = headerKeys(tableOf(await fetchPage(spec.url), spec.formId)).filter(
      (k): k is string => k !== null,
    )
    expect(keys.length).toBeGreaterThan(0)
    expect([...keys].sort()).toEqual(Object.keys(spec.order).sort())
    // An opt-out cannot outlive the column it names, and cannot be an
    // opt-out from being tested at all — only from the parity half. Which
    // columns may opt out is pinned literally in 'the escape hatches' below;
    // this checks each still exists. (Nothing asserts the REASON strings: they
    // are literals a few lines up in this same file, so no production change
    // could ever falsify a claim about them.)
    for (const key of Object.keys(spec.parityExempt ?? {})) {
      expect(keys, `${name}: parity opt-out for a column that no longer exists`).toContain(key)
    }
  })

  /**
   * The fixture's own integrity, asserted rather than assumed. Two columns
   * ordering the four rows the same way would make each of them substitutable
   * for the other — that is precisely how `displayName` and `eventType` came
   * to have tests that could not fail. Including the unsorted order here is
   * what stops an expected value from being what a DROPPED sort returns.
   */
  it('orders the fixture differently for every column, and differently from unsorted', async () => {
    expect(identities(await fetchPage(spec.url))).toEqual(spec.unsorted)
    const seen = new Map<string, string>([[spec.unsorted.join('|'), '(unsorted)']])
    for (const [key, want] of Object.entries(spec.order)) {
      expect([...want].sort()).toEqual([...spec.unsorted].sort())
      const seq = want.join('|')
      expect(
        seen.get(seq),
        `${name}: ${key} and ${seen.get(seq)} order the fixture identically`,
      ).toBeUndefined()
      seen.set(seq, key)
    }
  })

  it.each(Object.keys(TABLES[name].order))(
    'sorts by %s on its own value, not a neighbouring column',
    async (key) => {
      expect(identities(await sorted(key))).toEqual(spec.order[key])
    },
  )

  /**
   * THE RULE THAT MATTERS MOST, mechanically: with the page ordered by one
   * column, that column's own cell text must already be in order. An accessor
   * reading a different field fails here even when it happens to produce a
   * plausible-looking page, and — because the same accessor answers the filter
   * box — this is the half that keeps an operator's search matching the text
   * they can see.
   */
  it.each(Object.keys(TABLES[name].order).filter((k) => !(k in (TABLES[name].parityExempt ?? {}))))(
    'renders the %s column in the order it sorted by',
    async (key) => {
      const table = tableOf(await sorted(key), spec.formId)
      const index = headerKeys(table).indexOf(key)
      expect(index, `${name}: no <th> for ${key}`).toBeGreaterThan(-1)
      const column = rowCells(table).map((cells) => cells[index])
      expect(column.filter(Boolean)).toHaveLength(spec.unsorted.length)
      expect(column).toEqual(sortedTexts(column))
    },
  )
})

/**
 * `/webhooks`' `search` column is the one accessor here that is not sortable:
 * a synthetic, hidden column carrying the legacy `?search=` alias, whose `get`
 * is `[label, url].join(' ')`. It renders no `<th>`, so the sweep above cannot
 * reach it — and the reason it exists at all is that Label's own accessor must
 * NOT match URL text.
 *
 * Both halves are asserted: `?search=` finds a row by text that appears only
 * in its URL, and `?f_label=` for the same text finds nothing. Asserting only
 * the first would pass against a `search` aliased to Label's accessor only if
 * the needle also appeared in the label — and would pass against a `search`
 * aliased to the whole row.
 */
/**
 * Four accessors that concatenate their cell's several parts. An ORDER test
 * cannot see the parts after the first — `[name, issuer].join(' ')` sorts
 * exactly as `name` does whenever the names are distinct, so repointing any of
 * these at its first component alone leaves every ordering assertion above
 * green. What actually breaks is the FILTER: an operator typing text that is
 * on screen in that cell, but in a part the accessor dropped, gets zero rows
 * back with the row they are looking at still on the page. That is the defect
 * these four accessors were written to fix (must-fix 4 and 6), so it is the
 * one asserted here.
 */
/**
 * The two lists above that a new column or a new TABLE could otherwise slip
 * past, pinned literally rather than as a subset.
 *
 * The per-table coverage assertion already forces a new sortable COLUMN to be
 * declared — but the obvious way to satisfy it is to add the column to `order`
 * AND to `parityExempt` with a plausible sentence, which ships a column whose
 * cell and filter box disagree. So the whole opt-out set is written out here:
 * growing it is a visible, deliberate edit in one place, not a line buried in
 * a table's own definition.
 */
describe('the escape hatches, pinned', () => {
  it('opts exactly these columns out of the cell-parity check', () => {
    const optedOut = Object.fromEntries(
      CASES.map(({ name, spec }) => [name, Object.keys(spec.parityExempt ?? {}).sort()]).filter(
        ([, keys]) => (keys as string[]).length > 0,
      ),
    )
    expect(optedOut).toEqual({
      '/oauth-clients': ['status', 'tenants'],
      '/connect-links': ['customer', 'status'],
      '/connect-link-templates': ['name'],
      '/platforms': ['configured', 'enabled'],
      '/scope-groups': ['scopes'],
      '/api-keys': ['status'],
      '/data': ['lastChange'],
    })
  })

  /**
   * And the level above that: an eleventh admin TABLE landing with no entry in
   * `TABLES` at all. `TABLES` is a hand-written literal, so nothing about it
   * notices a new route — which is the same hiding place one level up.
   *
   * Every route file that declares a `TableSpec` has to be either a case in
   * `TABLES` or in the server-side list below, and the per-file DECLARATION
   * counts are pinned too: `webhooks.ts` builds two specs (the subscriptions
   * table, covered here, and the per-subscription deliveries table, which is
   * ordered upstream by `WebhookDeliveryStore`), so a file already in `TABLES`
   * growing a second table would otherwise pass unnoticed.
   */
  const SERVER_SIDE_SPECS: Record<string, string> = {
    'audit.ts':
      'paginated and ordered in SQL by AdminStore.listAudit — AUDIT_SORT_COLUMNS, pinned in admin-api/tests/unit/audit-sort-store.test.ts',
    'connections.ts':
      'ordered upstream by admin-api — CONNECTION_SORT_ACCESSORS, pinned in admin-api/tests/unit/connections-sort-filter.test.ts',
    'customers.ts':
      'ordered in SQL by EndUserStore.list — END_USER_SORT_COLUMNS, pinned in shared/tests/auth/end-users.test.ts',
    'sync-jobs.ts':
      'ordered in SQL by SyncStore.list — SYNC_SORT_COLUMNS, pinned in shared/tests/data-store/sync-store-sort.test.ts',
  }

  /**
   * WHAT THIS MATCH CAN AND CANNOT SEE, because an enumeration guard that
   * reads as exhaustive and is not is the exact failure this branch exists to
   * prevent.
   *
   * It matches the two ways a `TableSpec` is spelled where it is CONSTRUCTED:
   * an annotation (`const X: TableSpec = {` / `): TableSpec {`) and a
   * `satisfies TableSpec` assertion, which the first version of this test
   * missed — a probe file using it passed unnoticed. It recurses, so a table
   * added in a subdirectory of `routes/` counts too (there are none today).
   *
   * It CANNOT see a spec with no `TableSpec` in its own text: one built by a
   * helper that returns the type, one assembled as an untyped object literal
   * and passed straight to `reply.view`, or one declared outside
   * `src/core/routes` altogether. Those are not hypothetical shapes so much
   * as untried ones — every table in this app is written one of the two ways
   * above — but a maintainer inventing a third will not be caught here.
   *
   * It also OVER-counts in one shape: a `: TableSpec` in a PARAMETER
   * annotation (`function render(spec: TableSpec)`) inside a routes file would
   * be counted as a declaration and fail this test spuriously. There is none
   * today; the fix if one appears is to place it, not to loosen the match.
   *
   * And it cannot see coordinated drift at all — an accessor and its template
   * changed together stay green here and everywhere else in this file, which
   * is a property of testing rendered output, not of this match.
   *
   * The per-page assertions are the backstop: a table that renders sort links
   * has to be in `TABLES` to have any coverage at all, and reviewing a new
   * admin table means reading this file.
   */
  it('accounts for every route file that builds a TableSpec', () => {
    const root = join(__dirname, '../../src/core/routes')
    const declarations: Record<string, number> = {}
    const walk = (dir: string, prefix: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
        a.name.localeCompare(b.name),
      )) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.isDirectory()) {
          walk(join(dir, entry.name), rel)
          continue
        }
        if (!entry.name.endsWith('.ts')) continue
        const source = readFileSync(join(dir, entry.name), 'utf8')
        const count = (source.match(/(?::|\bsatisfies)\s*TableSpec\b/g) ?? []).length
        if (count > 0) declarations[rel] = count
      }
    }
    walk(root, '')
    // Every file, and how many tables it builds. A new admin table shows up
    // here as a new key or a bumped count and fails until it is placed.
    expect(declarations).toEqual({
      'api-keys.ts': 1,
      'audit.ts': 1,
      'connect-link-templates.ts': 1,
      'connect-links.ts': 1,
      'connections.ts': 1,
      'customers.ts': 1,
      'data.ts': 1,
      'identity-providers.ts': 1,
      'oauth-clients.ts': 1,
      'platforms.ts': 1,
      'scope-groups.ts': 1,
      'sync-jobs.ts': 1,
      'tenants.ts': 1,
      'users.ts': 1,
      // The subscriptions table (covered here) and the deliveries table
      // (server-side, see WEBHOOK_DELIVERY_SORT_COLUMNS).
      'webhooks.ts': 2,
    })
    const covered = CASES.map(({ spec }) => spec.route)
    expect([...covered].sort()).toEqual(
      Object.keys(declarations)
        .filter((f) => !(f in SERVER_SIDE_SPECS))
        .sort(),
    )
  })
})

/**
 * The exact form of the composite check, for the two accessors whose value
 * should be, character for character, the text their cell renders.
 *
 * The order and filter assertions below cannot reach the JOIN itself. A joined
 * value is always an extension of its own first part, so `', '` and `' '` and
 * `'; '` order the same way against that part; and a substring filter matches
 * either side of any separator. What is left is equality, run against the page
 * that actually rendered — the accessor is called on the fixture row, and the
 * cell text is scraped out of the HTML that row produced. Changing the
 * separator, dropping a component, or reordering the join all fail here, for
 * every separator, with no assumption about how a collation ranks punctuation.
 *
 * This is why two module-private `TableSpec`s are exported (see their own
 * comments). It is the mechanism to reach for whenever an accessor concatenates
 * — the fixture trick that pins ORDER cannot generalise to the join.
 *
 * Only accessors whose value is meant to EQUAL the cell belong here. The other
 * composites deliberately differ — /connect-links Customer truncates to eight
 * characters behind an emoji, /connect-link-templates Name omits one decorator
 * word — and are on the parity opt-out list for that reason.
 */
describe('composite accessors: the joined value IS the cell text', () => {
  const CASES_EXACT = [
    {
      what: '/connect-links Scope',
      url: '/connect-links',
      formId: 'links-filters',
      spec: CONNECT_LINKS_TABLE,
      key: 'scope',
      /** Column index of the cell, and of the one naming the row. */
      cell: 3,
      idCell: 0,
      rows: CONNECT_SESSIONS as Array<Record<string, unknown>>,
      /** How a fixture row names itself, to match it to a rendered one. */
      id: (row: Record<string, unknown>) => String(row.label),
    },
    {
      what: '/oauth-clients Issuer',
      url: '/oauth-clients',
      formId: 'oauth-filters',
      spec: OAUTH_TABLE,
      key: 'issuer',
      cell: 0,
      idCell: 0,
      rows: ISSUERS as unknown as Array<Record<string, unknown>>,
      // The Issuer cell IS the composite, so a row names itself by its first
      // word — the same reading `TABLES` uses for this page.
      id: (row: Record<string, unknown>) => String(row.name),
    },
  ]

  it.each(CASES_EXACT)('$what', async ({ url, formId, spec, key, cell, idCell, rows, id }) => {
    const get = spec.columns.find((c) => c.key === key)?.get
    expect(get, `no accessor for ${key}`).toBeTypeOf('function')
    const rendered = rowCells(tableOf(await fetchPage(url), formId))
    expect(rendered).toHaveLength(rows.length)
    for (const cells of rendered) {
      const name = cells[idCell].split(' ')[0]
      const row = rows.find((r) => id(r) === name)
      expect(row, `no fixture row named ${name}`).toBeDefined()
      expect(String(get!(row))).toBe(cells[cell])
    }
  })
})

/**
 * The two accessors that deliberately DIFFER from their cell, pinned to
 * declared golden values — what `get` must return, row by row, beside what the
 * cell renders for that same row.
 *
 * These two are the reason the parity opt-out list exists at all, and until
 * now they were the weakest thing in this file. The order assertions cannot
 * see a change that moves no row — a recased fallback word, a truncation, a
 * reordered join — and neither column can use the equality check above, since
 * neither value is meant to BE its cell. What was left holding them was the
 * handful of filter needles someone happened to pick. That is the same
 * guarantee the bug this whole branch was opened over lived under.
 *
 * Declaring both sides fixes two things at once. It pins the accessor exactly
 * — a changed fallback word, a truncation, a reordered join, a different
 * separator all fail here and NOWHERE else, since none of them moves a row.
 * And it states the divergence as an assertion instead of prose: `tp-echo`'s
 * cell reads `Echo template vertical: payments` where the accessor returns
 * `Echo template payments`, and that is now written down as the intended
 * answer rather than inferred from a comment. "Fixing" the divergence fails
 * here too, which is the point — it is a decision, not an oversight.
 *
 * Only these two, out of nine opt-outs. The other SEVEN are badges and counts,
 * not composites: each derives from one field by one expression, and the order
 * assertion already discriminates it against every other column in its table.
 * One of the seven could not join anyway — `/oauth-clients` Tenants reads
 * `tenantCount`, derived per row in that route's GET handler, which a bare
 * fixture row does not carry.
 *
 * THE RESIDUAL, stated so the next person does not have to rediscover it.
 * Three accessors combine or fall back and are pinned by ordering plus a
 * filter needle rather than by equality or a declared value:
 *
 *   - `/connect-links` Tenant (`tenantLabel`) and `/oauth-clients` Tenants
 *     (`tenantCount`) read values their GET handler hoists onto each row, so
 *     `get` over a fixture row reads `undefined` and NEITHER mechanism can
 *     apply. Closable — by hoisting the same fields in the fixture the way
 *     those handlers do — and deliberately not done here, because doing it
 *     properly means the test reproducing handler logic, which is a bigger
 *     change than the one it would close.
 *   - `/api-keys` Label (`k.label || k.prefix`) reads only raw fields and its
 *     value SHOULD equal its cell, so it could simply join `CASES_EXACT`
 *     above. It is the cheapest of the three to close.
 *
 * Two of those three — Tenant and Label — are ALSO covered by the cell-parity
 * ORDER check, because neither is on the opt-out list. Tenants is on it, so
 * the plain order assertion is all it has. The two columns below have no
 * parity check either, which is the whole reason they needed this one.
 */
describe('deliberate divergences, pinned to declared values', () => {
  const DIVERGENCES = [
    {
      what: '/connect-links Customer differs from its cell on every row',
      url: '/connect-links',
      formId: 'links-filters',
      spec: CONNECT_LINKS_TABLE,
      key: 'customer',
      cell: 1,
      idCell: 0,
      rows: CONNECT_SESSIONS as unknown as Array<Record<string, unknown>>,
      id: (row: Record<string, unknown>) => String(row.label),
      // `get` keeps the whole id so a pasted one matches; the cell shows an
      // emoji and the first eight characters. The customer-less row falls
      // back to the literal word the cell puts on screen.
      golden: {
        'delta-link': { value: 'cust-charlie', cell: '👤 cust-cha' },
        'alpha-link': { value: 'cust-delta', cell: '👤 cust-del' },
        'charlie-link': { value: 'anonymous', cell: '— anonymous' },
        'bravo-link': { value: 'cust-bravo', cell: '👤 cust-bra' },
        'echo-link': { value: 'cust-alpha', cell: '👤 cust-alp' },
      } as Record<string, { value: string; cell: string }>,
    },
    {
      what: '/connect-link-templates Name differs from its cell on one row',
      url: '/connect-link-templates',
      formId: 'templates-filters',
      spec: TEMPLATES_TABLE,
      key: 'name',
      cell: 1,
      idCell: 0,
      rows: CONNECT_TEMPLATES as unknown as Array<Record<string, unknown>>,
      id: (row: Record<string, unknown>) => String(row.tenantId),
      // Name, description and the pinned platform, space-joined, each part
      // skipped when absent. `tp-echo` is the divergence: `vertical: ` is on
      // screen and deliberately not in the value.
      golden: {
        'tp-charlie': {
          value: 'Delta template zulu notes crm/nutshell',
          cell: 'Delta template zulu notes crm/nutshell',
        },
        'tp-delta': { value: 'Alpha template', cell: 'Alpha template' },
        'tp-alpha': {
          value: 'Charlie template yankee notes',
          cell: 'Charlie template yankee notes',
        },
        'tp-bravo': {
          value: 'Bravo template ecommerce/shopify',
          cell: 'Bravo template ecommerce/shopify',
        },
        'tp-echo': { value: 'Echo template payments', cell: 'Echo template vertical: payments' },
      } as Record<string, { value: string; cell: string }>,
    },
  ]

  it.each(DIVERGENCES)(
    '$what',
    async ({ url, formId, spec, key, cell, idCell, rows, id, golden }) => {
      const accessor = spec.columns.find((c) => c.key === key)?.get
      expect(accessor, `no accessor for ${key}`).toBeTypeOf('function')
      const rendered = rowCells(tableOf(await fetchPage(url), formId))
      expect(rendered).toHaveLength(rows.length)
      // Every fixture row is accounted for, so a golden entry cannot be
      // dropped along with the row it describes and leave the rest passing.
      expect(Object.keys(golden).sort()).toEqual(rows.map(id).sort())
      for (const cells of rendered) {
        const name = cells[idCell]
        const row = rows.find((r) => id(r) === name)
        expect(row, `no fixture row named ${name}`).toBeDefined()
        expect(String(accessor!(row)), `${name}: accessor`).toBe(golden[name].value)
        expect(cells[cell], `${name}: cell`).toBe(golden[name].cell)
      }
    },
  )
})

describe('composite accessors match every part of the cell they render', () => {
  const rowsOf = (body: string, formId: string, cell: number) =>
    rowCells(tableOf(body, formId)).map((c) => c[cell])

  it('/oauth-clients Issuer matches the issuer URL as well as the display name', async () => {
    // 'd.example' appears only in delta-idp's issuer URL, never in a name.
    expect(
      rowsOf(await fetchPage('/oauth-clients?f_issuer=d.example'), 'oauth-filters', 0),
    ).toEqual(['delta-idp https://d.example/'])
    // And the name half still works, so this is not a URL-only accessor.
    expect(
      rowsOf(await fetchPage('/oauth-clients?f_issuer=bravo-idp'), 'oauth-filters', 0),
    ).toEqual(['bravo-idp https://b.example/'])
  })

  it('/connect-links Tenant matches the resolved name as well as the raw id', async () => {
    // The Tenant cell renders both; the accessor reads a hoisted "<name> <id>".
    expect(rowsOf(await fetchPage('/connect-links?f_tenant=t-alpha'), 'links-filters', 0)).toEqual([
      'delta-link',
    ])
    expect(
      rowsOf(await fetchPage('/connect-links?f_tenant=Charlie Ltd'), 'links-filters', 0),
    ).toEqual(['bravo-link'])
  })

  it('/connect-link-templates Name matches the description and pinned platform too', async () => {
    // Both are rendered in the Name cell, under the name itself.
    expect(
      rowsOf(await fetchPage('/connect-link-templates?f_name=zulu'), 'templates-filters', 0),
    ).toEqual(['tp-charlie'])
    // `crm/nutshell`, not the bare `nutshell`: the cell renders the pinned
    // platform as `vertical/slug`, so a needle of the slug alone would still
    // match an accessor that had dropped the `vertical/` half and would prove
    // only that the slug is SOMEWHERE in the value.
    expect(
      rowsOf(
        await fetchPage('/connect-link-templates?f_name=crm/nutshell'),
        'templates-filters',
        0,
      ),
    ).toEqual(['tp-charlie'])
    // The single-vertical branch, which had no coverage of any kind: deleting
    // it from `nameCellText` left every other assertion in this file green.
    expect(
      rowsOf(await fetchPage('/connect-link-templates?f_name=payments'), 'templates-filters', 0),
    ).toEqual(['tp-echo'])
    // The name half, so the accessor has not become description-only.
    expect(
      rowsOf(
        await fetchPage('/connect-link-templates?f_name=Bravo template'),
        'templates-filters',
        0,
      ),
    ).toEqual(['tp-bravo'])
  })

  it('/api-keys Label matches the prefix an unlabelled key falls back to', async () => {
    expect(rowsOf(await fetchPage('/api-keys?f_label=osk_delta'), 'api-keys-filters', 3)).toEqual([
      'osk_delta',
    ])
  })
})

describe('/webhooks — the hidden search column', () => {
  it('matches url text that is not in the label, while the Label filter does not', async () => {
    const rows = (body: string) => rowCells(tableOf(body, 'webhooks-filters')).map((c) => c[0])
    // 'b.example' is in wh-bravo's URL and in no label anywhere.
    expect(rows(await fetchPage('/webhooks?search=b.example'))).toEqual(['wh-bravo'])
    // The same needle through the Label box matches nothing — asserted as the
    // absence of every label rather than as a row count, because a
    // filtered-to-zero table still renders one row: its empty state.
    const byLabel = tableOf(await fetchPage('/webhooks?f_label=b.example'), 'webhooks-filters')
    for (const w of WEBHOOKS) if (w.label) expect(byLabel).not.toContain(w.label)
    // And it still matches on the label half, so it is not url-only either.
    expect(rows(await fetchPage('/webhooks?search=wh-bravo'))).toEqual(['wh-bravo'])
  })
})
