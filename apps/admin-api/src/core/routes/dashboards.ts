/**
 * Native dashboards — built-in ones defined in code plus operator-made ones.
 *
 * Routes:
 *   GET    /api/dashboards                  dashboards:view — built-ins, your own, shared with you
 *   GET    /api/dashboards/metrics          dashboards:view — the metric catalog in your scope
 *   GET    /api/dashboards/metrics/:id      dashboards:view — one metric over ?from&to
 *                                           (&currency&granularity&compare&dashboard
 *                                           &connection&platform)
 *   GET    /api/dashboards/currencies       dashboards:view — currencies to filter by
 *                                           (?dashboard&connection&platform)
 *   GET    /api/dashboards/connections      dashboards:view AND connections:read — the
 *                                           connections and adapters a dashboard's
 *                                           filter offers (?vertical&platform&search
 *                                           &dashboard&limit)
 *   GET    /api/dashboards/:id              dashboards:view
 *   POST   /api/dashboards                  dashboards:edit
 *   PATCH  /api/dashboards/:id              dashboards:edit — owner or admin
 *   DELETE /api/dashboards/:id              dashboards:edit — owner or admin
 *
 * A dashboard stores widget choices only (metric id, chart, width, title,
 * and the currency / granularity / compare options). Values come from
 * integration-server's metric catalog, computed for the VIEWER's scope on
 * every read: a shared dashboard shows each operator only the tenants they
 * may see, and a widget whose metric is outside their scope renders as
 * unavailable rather than leaking a number.
 *
 * The connection / adapter filter (`connection`, `platform`) only narrows:
 * the `dashboard` pins narrow the scope header first, and integration-server
 * narrows that scope's connections further. A connection outside the scope
 * yields no data, never an error that would confirm it exists. The
 * connections list the filter offers is scope-filtered here, the same way
 * (`tenantAllowed`, ∩ the pins), and carries ids, labels, adapters and
 * verticals only — never a tenant id, a status or a credential.
 *
 * The metric schemas below mirror integration-server's
 * `data-access/metrics/types.ts` field for field. The response serializer
 * parses every reply through them, so a field missing here is silently
 * stripped and a value outside an enum is a 500: the enums come from
 * `@opensteward/shared` (`dashboards/charts.ts`), the lists the engine uses,
 * so they cannot drift.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  GRANULARITIES,
  GRANULARITY_PARAMS,
  METRIC_KINDS,
  METRIC_SECTIONS,
  METRIC_UNITS,
} from '@opensteward/shared'
import type { AdminStore } from '../db/admin-store'
import type { RuntimeSettingsStore } from '../db/runtime-settings-store'
import {
  DASHBOARD_CHARTS,
  type DashboardRecord,
  type DashboardStore,
  type DashboardWidget,
} from '../db/dashboard-store'
import type { DataScopeHeader, UnifiedClient } from '../proxy/client'
import {
  callerContext,
  callerPermissions,
  getAccess,
  requirePermission,
  scopeAllows,
} from '../auth/access'
import {
  canEditDashboard,
  canSeeDashboard,
  checkAudienceChange,
  effectiveShareAll,
  narrowAccessScope,
  narrowDataScope,
  normalisePins,
  redactFor,
  sameAudience,
  samePins,
  type Audience,
  type Viewer,
} from '../dashboards/audience'
import {
  AudienceSchema,
  AudienceView,
  PinnedTenantsSchema,
  PinnedTenantsView,
  toAudience,
} from './_audience'
import {
  BUILTIN_DASHBOARDS,
  getBuiltinDashboard,
  type BuiltinDashboard,
} from '../dashboards/builtin'
import { buildDataScope, passUpstreamError, readMaskFinancial } from './data'
import { dataEnvelope, errorBody, noContent, VerticalEnum } from './_openapi'

const TAG = 'dashboards'

export const MAX_WIDGETS = 24

// ── Schemas ───────────────────────────────────────────────────────────────

const ChartEnum = z.enum(DASHBOARD_CHARTS).meta({
  id: 'DashboardChart',
  description: 'How a widget draws its metric.',
  example: 'line',
})

const MetricId = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9_.-]*$/)
  .meta({ description: 'Metric id from the catalog.', example: 'ecommerce.orders_per_day' })

/** ISO 4217: three upper-case letters, as integration-server's metric route requires. */
const CURRENCY_RE = /^[A-Z]{3}$/

/**
 * Currency codes fit to offer as choices: trimmed and upper-cased, ISO 4217
 * shape only, de-duplicated and sorted. The engine already normalises; this
 * holds the line at the hop that serves the admin UI too.
 */
export function isoCodes(values: readonly unknown[]): string[] {
  const out = new Set<string>()
  for (const v of values) {
    if (typeof v !== 'string') continue
    const code = v.trim().toUpperCase()
    if (CURRENCY_RE.test(code)) out.add(code)
  }
  return [...out].sort()
}

const CurrencyCode = z
  .string()
  .regex(CURRENCY_RE, 'must be an ISO 4217 code (three upper-case letters)')

/** A connection id, as integration-server's metric routes accept one (UUIDs fit). */
const CONNECTION_ID_RE = /^[A-Za-z0-9_-]{1,100}$/
/** An adapter slug, as integration-server's metric routes accept one. */
const PLATFORM_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

const ConnectionParam = z
  .string()
  .regex(CONNECTION_ID_RE, 'must be a connection id (1–100 letters, digits, `_` or `-`)')
  .meta({
    description:
      'Only this connection. It narrows your scope (and the dashboard’s pins) further; a connection outside them yields no data rather than an error.',
    example: '0b6f3c1e-8a2d-4c55-9e0f-3d1f2a7b9c10',
  })

const PlatformParam = z
  .string()
  .regex(PLATFORM_SLUG_RE, 'must be an adapter slug (lower-case letters, digits and `-`)')
  .meta({
    description:
      'Only connections of this adapter. Narrows like `connection`; both together mean both.',
    example: 'shopify',
  })

/** A vertical name, as integration-server's metric routes accept one. */
const VERTICAL_RE = /^[a-z][a-z-]{1,40}$/

const FilterVerticalParam = z
  .string()
  .regex(VERTICAL_RE, 'must be a vertical name (lower-case letters and `-`)')
  .meta({
    description:
      'The dashboard’s vertical. With `connection` or `platform`, keeps the filter to that vertical’s connections (one adapter slug can exist in several verticals, and system metrics read every vertical); alone it filters nothing.',
    example: 'ecommerce',
  })

/**
 * 403 unless a caller who asks for a connection / adapter filter may read
 * connections: the filter is connection data, so `dashboards:view` alone
 * does not reach it (the routes guard `dashboards:view` and stay usable
 * without a filter). True when the request may go on.
 */
async function filterAllowed(
  request: FastifyRequest,
  reply: FastifyReply,
  q: { connection?: string; platform?: string },
): Promise<boolean> {
  if (!q.connection && !q.platform) return true
  if ((await callerPermissions(request)).has('connections:read')) return true
  reply.status(403).send({ error: 'Forbidden — missing permission connections:read' })
  return false
}

/** The filter parameters to forward, each only when set. */
function filterParams(q: { connection?: string; platform?: string; vertical?: string }) {
  return {
    ...(q.connection ? { connection: q.connection } : {}),
    ...(q.platform ? { platform: q.platform } : {}),
    ...(q.vertical ? { vertical: q.vertical } : {}),
  }
}

/** Connections offered by `GET /api/dashboards/connections`: default and most. */
export const DASHBOARD_CONNECTIONS_DEFAULT_LIMIT = 50
export const DASHBOARD_CONNECTIONS_MAX_LIMIT = 200
/** How long adapter display names from the platform catalog are reused. */
const PLATFORM_NAMES_TTL_MS = 10 * 60_000

const GranularityParamEnum = z.enum(GRANULARITY_PARAMS).meta({
  id: 'MetricGranularityParam',
  description:
    'Time buckets for a series: `auto` is day up to 62 days, week up to 182, else month.',
  example: 'auto',
})

const Widget = z
  .object({
    metricId: MetricId,
    title: z.string().trim().max(80).optional().meta({
      description: 'Heading shown on the widget; defaults to the metric title.',
      example: 'Orders (last 30 days)',
    }),
    chart: ChartEnum,
    width: z.number().int().min(1).max(12).meta({
      description: 'Width in grid columns, out of 12.',
      example: 6,
    }),
    currency: CurrencyCode.nullable().optional().meta({
      description:
        "Pin the widget to one currency (ISO 4217). Absent or null follows the dashboard view's currency filter; with no filter every currency is drawn separately. Metrics without money or a currency field ignore it.",
      example: 'EUR',
    }),
    granularity: GranularityParamEnum.optional(),
    compare: z.boolean().optional().meta({
      description:
        'Also compute the prior equal-length period; number and gauge charts show the change. Only metrics marked `comparable` use it.',
      example: true,
    }),
  })
  .meta({
    id: 'DashboardWidget',
    description:
      "One chart on a dashboard. `chart` must be one of its metric's `charts` (`400` otherwise).",
  })

const Dashboard = z
  .object({
    id: z.string().meta({
      description: 'Dashboard id: `builtin:<slug>` or `dsh_…`.',
      example: 'builtin:ecommerce',
    }),
    name: z.string().meta({ description: 'Dashboard name.', example: 'Ecommerce' }),
    description: z.string().nullable().meta({
      description: 'What the dashboard is for.',
      example: 'Orders and revenue.',
    }),
    widgets: z.array(Widget).meta({ description: 'Widgets, in display order.', example: [] }),
    builtin: z.boolean().meta({ description: 'Defined in code; read-only.', example: true }),
    vertical: z.string().nullable().meta({
      description: 'The vertical a built-in dashboard is about; null otherwise.',
      example: 'ecommerce',
    }),
    ownerUserId: z.string().nullable().meta({
      description: 'Owner; null for a built-in.',
      example: 'usr_1',
    }),
    audience: AudienceView,
    pinnedTenants: PinnedTenantsView,
    editable: z.boolean().meta({
      description: 'Whether you may edit or delete it.',
      example: false,
    }),
    createdAt: z.string().nullable().meta({
      description: 'ISO 8601; null for a built-in.',
      example: '2026-03-01T10:00:00.000Z',
    }),
    updatedAt: z.string().nullable().meta({
      description: 'ISO 8601; null for a built-in.',
      example: '2026-03-01T10:00:00.000Z',
    }),
  })
  .meta({ id: 'Dashboard', description: 'A native dashboard.' })

const CreateBody = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .meta({ description: 'Name.', example: 'Weekly revenue' }),
    description: z.string().trim().max(500).nullable().optional().meta({
      description: 'What the dashboard is for.',
      example: 'Revenue across our shops.',
    }),
    audience: AudienceSchema.optional(),
    pinnedTenants: PinnedTenantsSchema.optional(),
    widgets: z
      .array(Widget)
      .max(MAX_WIDGETS)
      .meta({
        description: `Widgets in display order (at most ${MAX_WIDGETS}).`,
        example: [{ metricId: 'ecommerce.revenue_per_day', chart: 'bar', width: 12 }],
      }),
  })
  .meta({ id: 'CreateDashboardBody', description: 'Request body to create a dashboard.' })

const UpdateBody = z
  .object({
    name: z.string().trim().min(1).max(100).optional().meta({
      description: 'New name.',
      example: 'Weekly revenue',
    }),
    description: z.string().trim().max(500).nullable().optional().meta({
      description: 'New description; `null` clears it.',
      example: null,
    }),
    audience: AudienceSchema.optional(),
    pinnedTenants: PinnedTenantsSchema.optional(),
    widgets: z
      .array(Widget)
      .max(MAX_WIDGETS)
      .optional()
      .meta({
        description: `Replacement widget list (at most ${MAX_WIDGETS}).`,
        example: [{ metricId: 'ecommerce.orders_per_day', chart: 'line', width: 6 }],
      }),
  })
  .meta({ id: 'UpdateDashboardBody', description: 'Request body to edit a dashboard.' })

const Thresholds = z
  .object({
    warn: z.number().meta({ description: 'Warning level.', example: 20 }),
    crit: z.number().meta({ description: 'Critical level.', example: 40 }),
    direction: z.enum(['above', 'below']).meta({
      description: '`above`: higher is worse; `below`: lower is worse.',
      example: 'above',
    }),
  })
  .meta({
    id: 'MetricThresholds',
    description: 'Levels that colour a number or gauge chart, in the metric’s unit.',
  })

const MetricInfo = z
  .object({
    id: z.string().meta({ description: 'Metric id.', example: 'ecommerce.orders_per_day' }),
    title: z.string().meta({ description: 'Title.', example: 'Orders per day' }),
    description: z
      .string()
      .meta({ description: 'What it measures.', example: 'Orders created per day.' }),
    kind: z.enum(METRIC_KINDS).meta({
      description: 'Shape of the result.',
      example: 'timeseries',
    }),
    unit: z.enum(METRIC_UNITS).meta({
      description: 'Unit of the headline value (`percent` is 0–100).',
      example: 'count',
    }),
    section: z.enum(METRIC_SECTIONS).meta({
      description: 'Where the metric sits inside its vertical, for grouping in the editor.',
      example: 'sales',
    }),
    vertical: z.string().nullable().meta({
      description: 'Vertical; null for system metrics.',
      example: 'ecommerce',
    }),
    resourceType: z.string().nullable().meta({
      description: 'Resource type; null for system metrics.',
      example: 'orders',
    }),
    charts: z.array(ChartEnum).meta({
      description: 'Chart types that fit this metric; the first is the default.',
      example: ['line', 'area', 'bar'],
    }),
    money: z.boolean().meta({
      description: 'Values are money, one set per currency, never combined across currencies.',
      example: false,
    }),
    currencyAware: z.boolean().meta({
      description: 'The `currency` parameter changes the result.',
      example: false,
    }),
    snapshot: z.boolean().meta({
      description: 'Evaluated as of now: the range is ignored.',
      example: false,
    }),
    granular: z.boolean().meta({
      description: 'The `granularity` parameter applies (a series over time).',
      example: true,
    }),
    comparable: z.boolean().meta({
      description: '`compare=1` adds `previous`, the prior equal-length range.',
      example: true,
    }),
    defaultGranularity: z.enum(GRANULARITIES).optional().meta({
      description:
        'The bucket size this metric uses when a request leaves `granularity` unset (or `auto`); absent means the range decides.',
      example: 'month',
    }),
    thresholds: Thresholds.optional(),
    note: z.string().optional().meta({
      description: 'A caveat to show under the widget.',
      example: 'Proxy: updatedAt as completion date.',
    }),
  })
  .meta({ id: 'MetricInfo', description: 'One metric in the catalog.' })

const MetricRange = z
  .object({
    from: z.string().meta({ description: 'First day, inclusive.', example: '2026-03-01' }),
    to: z.string().meta({ description: 'Last day, inclusive.', example: '2026-03-30' }),
  })
  .meta({ description: 'Days covered.', example: { from: '2026-03-01', to: '2026-03-30' } })

const MetricPoint = z
  .object({
    x: z.string().meta({
      description: 'Bucket (`YYYY-MM-DD`, `YYYY-Www`, `YYYY-MM`) or category.',
      example: '2026-03-01',
    }),
    y: z.number().nullable().meta({
      description:
        'Value (money in major units); null for a bucket with no defined value (a ratio with no denominator, an average of nothing).',
      example: 42,
    }),
  })
  .meta({ id: 'MetricPoint', description: 'One point of a series.' })

const MetricSeries = z
  .object({
    name: z.string().meta({ description: 'Series name.', example: 'USD' }),
    currency: z.string().nullable().optional().meta({
      description:
        'ISO 4217 code of a money series; null when its records carried none. Absent on counts. A series never mixes currencies.',
      example: 'USD',
    }),
    kind: z.enum(['bar', 'line']).optional().meta({
      description: 'How a `combo` chart draws this series.',
      example: 'bar',
    }),
    points: z.array(MetricPoint).meta({ description: 'Points.', example: [] }),
  })
  .meta({ id: 'MetricSeries', description: 'One series of a metric result.' })

const MetricTotal = z
  .object({
    currency: z.string().nullable().meta({
      description: 'Currency; null when the records carried none.',
      example: 'USD',
    }),
    amount: z.number().meta({ description: 'Amount in major units.', example: 19.99 }),
    amountMinor: z.number().meta({ description: 'Amount in minor units.', example: 1999 }),
  })
  .meta({ id: 'MetricTotal', description: 'A money headline for one currency.' })

const MetricKpi = z
  .object({
    key: z.string().meta({
      description: 'Stable key (`p50`, `hhi`, `top5_share`, `numerator`, …).',
      example: 'p50',
    }),
    label: z.string().meta({ description: 'Display label.', example: 'Median' }),
    value: z.number().nullable().meta({ description: 'Value; null when undefined.', example: 3.5 }),
    unit: z.enum(METRIC_UNITS).meta({ description: 'Unit of the value.', example: 'days' }),
    currency: z.string().nullable().optional().meta({
      description: 'Currency of a per-currency KPI; absent on currency-free ones.',
      example: 'USD',
    }),
  })
  .meta({ id: 'MetricKpi', description: 'A named number of a metric result.' })

const MetricStats = z
  .object({
    group: z
      .string()
      .meta({ description: 'Group label; the first entry is `All`.', example: 'All' }),
    n: z.number().meta({ description: 'Values in the group.', example: 12 }),
    min: z.number().meta({ description: 'Minimum.', example: 0.5 }),
    p25: z.number().meta({ description: '25th percentile.', example: 1 }),
    p50: z.number().meta({ description: 'Median.', example: 2 }),
    p75: z.number().meta({ description: '75th percentile.', example: 4 }),
    p90: z.number().meta({ description: '90th percentile.', example: 7 }),
    max: z.number().meta({ description: 'Maximum.', example: 12 }),
    mean: z.number().meta({ description: 'Mean.', example: 3.1 }),
  })
  .meta({ id: 'MetricStats', description: 'The distribution of one group (a boxplot).' })

const MetricResult = z
  .object({
    metric: MetricInfo,
    range: MetricRange,
    granularity: z.enum(GRANULARITIES).nullable().meta({
      description: 'Bucket size of a series over time; null for other kinds.',
      example: 'day',
    }),
    currency: z.string().nullable().meta({
      description: 'The currency filter applied; null means every currency, each separately.',
      example: null,
    }),
    currencies: z.array(z.string()).meta({
      description:
        'Currencies present in scope and range before the filter ([] for currency-free metrics).',
      example: ['EUR', 'USD'],
    }),
    value: z.number().nullable().meta({
      description:
        'Headline for currency-free metrics (count, percent, days, index); null for money, and for a result that spans several currencies.',
      example: 120,
    }),
    previous: z
      .object({
        value: z
          .number()
          .nullable()
          .meta({ description: 'Headline over the prior range.', example: 98 }),
        totals: z.array(MetricTotal).optional().meta({
          description: 'Money headlines over the prior range, one per currency.',
          example: [],
        }),
        range: MetricRange,
      })
      .optional()
      .meta({
        description: 'With `compare=1`: the same metric over the prior equal-length range.',
        example: { value: 98, range: { from: '2026-01-30', to: '2026-02-28' } },
      }),
    totals: z
      .array(MetricTotal)
      .optional()
      .meta({ description: 'Money headlines, one per currency.', example: [] }),
    series: z.array(MetricSeries).meta({
      description: 'Series to chart; money series always carry `currency`.',
      example: [],
    }),
    kpis: z.array(MetricKpi).optional().meta({ description: 'Named numbers.', example: [] }),
    table: z
      .object({
        columns: z.array(z.object({ key: z.string(), label: z.string() })),
        rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))),
      })
      .optional()
      .meta({
        description: 'Rows of the result: top-N with share and cumulative share, stats, lists.',
        example: { columns: [], rows: [] },
      }),
    matrix: z
      .object({
        x: z.array(z.string()),
        y: z.array(z.string()),
        cells: z.array(z.array(z.number()).length(3)).meta({
          description: '`[xIndex, yIndex, value]`, every cell present.',
          example: [[0, 0, 3]],
        }),
      })
      .optional()
      .meta({
        description: 'Heatmap cells (matrix kind).',
        example: { x: ['Mon'], y: ['09:00 UTC'], cells: [[0, 0, 3]] },
      }),
    stats: z
      .array(MetricStats)
      .optional()
      .meta({ description: 'Distributions: `All` first, then one per group.', example: [] }),
    coverage: z
      .object({
        eligible: z
          .number()
          .meta({ description: 'Records carrying every coverage field.', example: 62 }),
        total: z.number().meta({ description: 'Records in scope and range.', example: 100 }),
      })
      .optional()
      .meta({
        description: 'How many records the metric could use.',
        example: { eligible: 62, total: 100 },
      }),
    thresholds: Thresholds.optional(),
    note: z.string().optional().meta({
      description: 'A caveat to show under the widget.',
      example: 'Weekday and hour are UTC.',
    }),
    masked: z.boolean().meta({
      description: 'True when financial values are withheld by `data_access.mask_financial`.',
      example: false,
    }),
    filter: z
      .object({
        connection: z.string().nullable().meta({
          description: 'The connection the result is narrowed to; null for every connection.',
          example: '0b6f3c1e-8a2d-4c55-9e0f-3d1f2a7b9c10',
        }),
        platform: z.string().nullable().meta({
          description: 'The adapter the result is narrowed to; null for every adapter.',
          example: 'shopify',
        }),
        vertical: z.string().nullable().meta({
          description: 'The vertical the filter was kept to; null when the request named none.',
          example: 'ecommerce',
        }),
      })
      .optional()
      .meta({
        description:
          'The connection / adapter filter applied, when `connection` or `platform` was given; absent otherwise.',
        example: { connection: null, platform: 'shopify', vertical: 'ecommerce' },
      }),
    generatedAt: z.string().meta({
      description: 'When the values were computed (cached up to 60 s).',
      example: '2026-03-30T10:00:00.000Z',
    }),
  })
  .meta({ id: 'MetricResult', description: 'A metric computed over your scope.' })

const IdParam = z.object({ id: z.string() })

const DashboardConnection = z
  .object({
    id: z.string().meta({
      description: 'Connection id: the value of a metric’s `connection` parameter.',
      example: '0b6f3c1e-8a2d-4c55-9e0f-3d1f2a7b9c10',
    }),
    label: z.string().nullable().meta({
      description: 'The name the operator gave the connection; null when it has none.',
      example: 'Acme main shop',
    }),
    platform: z.string().meta({ description: 'Adapter slug.', example: 'shopify' }),
    vertical: z.string().meta({ description: 'Vertical.', example: 'ecommerce' }),
  })
  .meta({
    id: 'DashboardConnection',
    description:
      'A connection a dashboard can be filtered to. Carries no tenant, status or credential.',
  })

const DashboardConnectionPlatform = z
  .object({
    slug: z.string().meta({ description: 'Adapter slug.', example: 'shopify' }),
    name: z.string().meta({
      description: 'Display name from the platform catalog; the slug when the catalog has none.',
      example: 'Shopify',
    }),
    count: z.number().meta({ description: 'Connections of this adapter you can see.', example: 3 }),
  })
  .meta({
    id: 'DashboardConnectionPlatform',
    description: 'An adapter a dashboard can be filtered to.',
  })

const DashboardConnections = z
  .object({
    connections: z.array(DashboardConnection).meta({
      description:
        'Matching connections, at most `limit`: an exact id match first, then by label (unlabelled last), then id.',
      example: [],
    }),
    platforms: z.array(DashboardConnectionPlatform).meta({
      description:
        'The adapters among the vertical’s connections you can see (ignoring `search` and `platform`), by slug.',
      example: [{ slug: 'shopify', name: 'Shopify', count: 3 }],
    }),
    total: z.number().meta({
      description: 'How many connections match, before `limit`.',
      example: 3,
    }),
  })
  .meta({ id: 'DashboardConnections', description: 'What a dashboard’s connection filter offers.' })

/** Where `search` matches, and how well: 2 exact id, 1 substring, 0 none. */
function searchRank(c: { id: string; label: string | null }, search: string): number {
  const id = c.id.toLowerCase()
  if (id === search) return 2
  return id.includes(search) || (c.label ?? '').toLowerCase().includes(search) ? 1 : 0
}

// ── Helpers ───────────────────────────────────────────────────────────────

type DashboardView = z.infer<typeof Dashboard>

function builtinView(d: BuiltinDashboard): DashboardView {
  return {
    id: d.id,
    name: d.name,
    description: d.description,
    widgets: d.widgets,
    builtin: true,
    vertical: d.vertical,
    ownerUserId: null,
    audience: { kind: 'everyone' },
    pinnedTenants: null,
    editable: false,
    createdAt: null,
    updatedAt: null,
  }
}

function storedView(d: DashboardRecord, editable: boolean, viewer: Viewer): DashboardView {
  return {
    id: d.id,
    name: d.name,
    description: d.description,
    widgets: d.widgets,
    builtin: false,
    vertical: null,
    ownerUserId: d.ownerUserId,
    ...redactFor(viewer, d, editable),
    editable,
    createdAt: new Date(d.createdAt).toISOString(),
    updatedAt: new Date(d.updatedAt).toISOString(),
  }
}

export function createDashboardsRoutes(
  dashboards: DashboardStore,
  unifiedClient: UnifiedClient,
  adminStore: AdminStore,
  runtimeSettings?: RuntimeSettingsStore,
) {
  const scopeFor = async (request: FastifyRequest) =>
    buildDataScope(request, {
      revealPii: false,
      maskFinancial: await readMaskFinancial(runtimeSettings),
    })

  let platformNames: { at: number; names: Map<string, string> } | null = null

  /**
   * `vertical/slug` → display name, from integration-server's platform
   * catalog, reused for ten minutes. Never throws: without it the slug is
   * the name, which is still a correct identifier.
   */
  async function platformNameIndex(): Promise<Map<string, string>> {
    if (platformNames && Date.now() - platformNames.at < PLATFORM_NAMES_TTL_MS) {
      return platformNames.names
    }
    try {
      const names = new Map<string, string>()
      for (const p of await unifiedClient.listCatalog()) {
        const name = typeof p.name === 'string' ? p.name.trim() : ''
        if (typeof p.slug === 'string' && typeof p.vertical === 'string' && name) {
          names.set(`${p.vertical}/${p.slug}`, name)
        }
      }
      platformNames = { at: Date.now(), names }
      return names
    } catch {
      return new Map()
    }
  }

  async function viewerOf(request: FastifyRequest): Promise<Viewer> {
    const ctx = await callerContext(request)
    return { userId: request.jwtUser!.id, access: ctx.access, admin: ctx.baseRole === 'admin' }
  }

  /** 400/403 for a sharing change this caller may not make; null when allowed. */
  async function sharingRefusal(
    request: FastifyRequest,
    changed: { audience?: Audience; pinnedTenants?: string[] | null },
    result: { audience: Audience; pinnedTenants: string[] | null },
    stored: { audience: Audience; pinnedTenants: string[] | null },
  ) {
    if (changed.audience === undefined && changed.pinnedTenants === undefined) {
      const check = checkAudienceChange({
        changed,
        result,
        stored,
        access: null,
        canShareAll: true,
        knownTenants: new Set(),
      })
      return check.ok ? null : check
    }
    const ctx = await callerContext(request)
    const check = checkAudienceChange({
      changed,
      result,
      stored,
      access: ctx.access,
      canShareAll: effectiveShareAll(ctx.permissions, ctx.access),
      knownTenants: new Set((await adminStore.listTenants()).map((t) => t.id)),
    })
    return check.ok ? null : check
  }

  async function auditShare(
    request: FastifyRequest,
    d: DashboardRecord,
    from: { audience: Audience; pinnedTenants: string[] | null },
  ) {
    if (sameAudience(from.audience, d.audience) && samePins(from.pinnedTenants, d.pinnedTenants)) {
      return
    }
    await adminStore.writeAudit({
      userId: request.jwtUser!.id,
      action: 'dashboard.share',
      targetId: d.id,
      detail: {
        name: d.name,
        from: from.audience,
        to: d.audience,
        pinnedFrom: from.pinnedTenants,
        pinnedTo: d.pinnedTenants,
      },
    })
  }

  /**
   * Why a layout does not fit the caller's catalog, or null when it does:
   * every metric must be in it, and every widget's chart must be one of its
   * metric's `charts` (a pie of a money series across currencies, a heatmap
   * of a count, … are refused here rather than drawn wrong).
   */
  async function layoutRefusal(
    request: FastifyRequest,
    widgets: DashboardWidget[],
  ): Promise<string | null> {
    if (widgets.length === 0) return null
    const catalog = (await unifiedClient.listDataMetrics(await scopeFor(request))) as Array<{
      id?: unknown
      charts?: unknown
    }>
    const chartsById = new Map(
      catalog.map((m) => [String(m.id), Array.isArray(m.charts) ? m.charts.map(String) : []]),
    )
    const unknown = [...new Set(widgets.map((w) => w.metricId))].filter((id) => !chartsById.has(id))
    if (unknown.length > 0) return `Unknown metric: ${unknown.join(', ')}`
    const misfit = widgets.find((w) => !chartsById.get(w.metricId)!.includes(w.chart))
    return misfit ? `Chart ${misfit.chart} does not fit ${misfit.metricId}` : null
  }

  /**
   * The stored shape of a widget. A null currency and an absent one mean the
   * same (follow the view's filter), so only a pinned code is kept.
   */
  function normaliseWidgets(widgets: DashboardWidget[]): DashboardWidget[] {
    return widgets.map((w) => ({
      metricId: w.metricId,
      ...(w.title ? { title: w.title } : {}),
      chart: w.chart,
      width: w.width,
      ...(typeof w.currency === 'string' ? { currency: w.currency } : {}),
      ...(w.granularity ? { granularity: w.granularity } : {}),
      ...(typeof w.compare === 'boolean' ? { compare: w.compare } : {}),
    }))
  }

  /**
   * The caller's data scope, narrowed to a dashboard's pinned tenants when
   * `dashboardId` names a stored one (a built-in has no pins). Null — with the
   * 404 already sent — when the caller cannot see that dashboard.
   */
  async function scopeForDashboard(
    request: FastifyRequest,
    reply: FastifyReply,
    dashboardId: string | undefined,
  ): Promise<DataScopeHeader | null> {
    const scope = await scopeFor(request)
    if (!dashboardId || getBuiltinDashboard(dashboardId)) return scope
    const d = await dashboards.get(dashboardId)
    if (!d || !canSeeDashboard(await viewerOf(request), d)) {
      reply.status(404).send({ error: 'Dashboard not found' })
      return null
    }
    return narrowDataScope(scope, d.pinnedTenants)
  }

  /**
   * The caller's tenant scope, narrowed to a stored dashboard's pins: the
   * same narrowing `scopeForDashboard` applies to the data scope header, for
   * filtering the connection list here. `undefined` — with the 404 already
   * sent — when the caller cannot see that dashboard.
   */
  async function accessScopeForDashboard(
    request: FastifyRequest,
    reply: FastifyReply,
    dashboardId: string | undefined,
  ) {
    const scope = (await getAccess(request))?.scope ?? null
    if (!dashboardId || getBuiltinDashboard(dashboardId)) return { scope }
    const d = await dashboards.get(dashboardId)
    if (!d || !canSeeDashboard(await viewerOf(request), d)) {
      reply.status(404).send({ error: 'Dashboard not found' })
      return undefined
    }
    return { scope: narrowAccessScope(scope, d.pinnedTenants) ?? null }
  }

  return async function dashboardsRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', fastify.authenticate)

    fastify.get(
      '/api/dashboards',
      {
        preHandler: [requirePermission('dashboards:view')],
        schema: {
          tags: [TAG],
          summary: 'List dashboards',
          description:
            'The built-in dashboards, then every dashboard shared with you (your own, those shared with a tenant in your access, those shared with everyone; an admin with access to every tenant sees all), most recently updated first. Requires `dashboards:view`.',
          operationId: 'dashboards.list',
          response: {
            200: z.object({ data: z.array(Dashboard) }),
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async (request) => {
        const viewer = await viewerOf(request)
        const stored = (await dashboards.listAll()).filter((d) => canSeeDashboard(viewer, d))
        return {
          data: [
            ...BUILTIN_DASHBOARDS.map(builtinView),
            ...stored.map((d) => storedView(d, canEditDashboard(viewer, d), viewer)),
          ],
        }
      },
    )

    fastify.get(
      '/api/dashboards/metrics',
      {
        preHandler: [requirePermission('dashboards:view')],
        schema: {
          tags: [TAG],
          summary: 'List the metric catalog',
          description:
            'Every metric a widget can chart in your scope: built-in system metrics and per-vertical metrics over stored records. Metrics never read personal-data fields. Requires `dashboards:view`.',
          operationId: 'dashboards.metrics.list',
          response: {
            200: z.object({ data: z.array(MetricInfo) }),
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async (request, reply) => {
        try {
          return { data: await unifiedClient.listDataMetrics(await scopeFor(request)) }
        } catch (err) {
          return passUpstreamError(reply, err)
        }
      },
    )

    const DashboardQuery = z.string().max(100).optional().meta({
      description:
        'The dashboard this widget belongs to: applies its pinned tenants (your scope ∩ its pins). 404 when you cannot see it.',
      example: 'dsh_0123456789abcdef0123',
    })

    fastify.get<{
      Params: { id: string }
      Querystring: {
        from?: string
        to?: string
        dashboard?: string
        currency?: string
        granularity?: (typeof GRANULARITY_PARAMS)[number]
        compare?: '0' | '1'
        connection?: string
        platform?: string
        vertical?: string
      }
    }>(
      '/api/dashboards/metrics/:id',
      {
        preHandler: [requirePermission('dashboards:view')],
        schema: {
          tags: [TAG],
          summary: 'Compute one metric',
          description:
            "One metric over the connections in your tenant scope, for the days `from`..`to` (inclusive, `YYYY-MM-DD`; default the last 30 days, at most 366). Money is never combined across currencies: every money series, total and KPI carries its currency, and `currency` keeps only one. `granularity` sets the buckets of a series over time and `compare=1` adds `previous`, the prior equal-length range. Results are cached for 60 seconds per metric, scope and parameters. Requires `dashboards:view`. `404` for a metric outside your scope, `400` for a bad range or parameter, `409` in passthrough mode. Pass `dashboard` to apply that dashboard's pinned tenants (your scope ∩ its pins), and `connection` and/or `platform` to narrow further to one connection and/or one adapter (system metrics included), kept to `vertical` when given; a connection outside your scope yields no data, and the result echoes the filter as `filter`. `connection` and `platform` also need `connections:read` (`403` otherwise).",
          operationId: 'dashboards.metrics.get',
          params: IdParam,
          querystring: z.object({
            from: z.string().optional().meta({ description: 'First day.', example: '2026-03-01' }),
            to: z.string().optional().meta({ description: 'Last day.', example: '2026-03-30' }),
            dashboard: DashboardQuery,
            currency: CurrencyCode.optional().meta({
              description:
                'Keep only this currency (ISO 4217): money metrics keep its amounts, counts with a currency field count only its records, other metrics ignore it.',
              example: 'EUR',
            }),
            granularity: GranularityParamEnum.optional(),
            compare: z.enum(['0', '1']).optional().meta({
              description:
                '`1` adds `previous`: the same metric over the prior equal-length range.',
              example: '1',
            }),
            connection: ConnectionParam.optional(),
            platform: PlatformParam.optional(),
            vertical: FilterVerticalParam.optional(),
          }),
          response: {
            200: dataEnvelope(MetricResult),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        try {
          const q = request.query ?? {}
          if (!(await filterAllowed(request, reply, q))) return reply
          const scope = await scopeForDashboard(request, reply, q.dashboard)
          if (!scope) return reply
          const data = await unifiedClient.getDataMetric(scope, request.params.id, {
            from: q.from || undefined,
            to: q.to || undefined,
            ...(q.currency ? { currency: q.currency } : {}),
            ...(q.granularity ? { granularity: q.granularity } : {}),
            ...(q.compare === '1' ? { compare: true } : {}),
            ...filterParams(q),
          })
          reply.header('cache-control', 'no-store')
          return { data }
        } catch (err) {
          return passUpstreamError(reply, err)
        }
      },
    )

    fastify.get<{
      Querystring: { dashboard?: string; connection?: string; platform?: string; vertical?: string }
    }>(
      '/api/dashboards/currencies',
      {
        preHandler: [requirePermission('dashboards:view')],
        schema: {
          tags: [TAG],
          summary: 'List currencies to filter by',
          description:
            "The distinct currencies (ISO 4217, sorted) across the money and currency fields the metric catalog reads, over the connections in your tenant scope — the choices for a dashboard's currency filter and a widget's currency pin. Pass `dashboard` to narrow to that dashboard's pinned tenants (your scope ∩ its pins), and `connection` and/or `platform` (kept to `vertical` when given) to list only that connection's or adapter's currencies. Cached for 60 seconds per scope and filter. Requires `dashboards:view`, and `connections:read` too with `connection` or `platform` (`403` otherwise). `400` for a malformed `connection`, `platform` or `vertical`, `404` for a dashboard you cannot see, `409` in passthrough mode.",
          operationId: 'dashboards.currencies.list',
          querystring: z.object({
            dashboard: DashboardQuery,
            connection: ConnectionParam.optional(),
            platform: PlatformParam.optional(),
            vertical: FilterVerticalParam.optional(),
          }),
          response: {
            200: z.object({
              data: z.array(z.string()).meta({
                description: 'Currency codes, sorted; records without a currency are not listed.',
                example: ['EUR', 'GBP', 'USD'],
              }),
            }),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        try {
          const q = request.query ?? {}
          if (!(await filterAllowed(request, reply, q))) return reply
          const scope = await scopeForDashboard(request, reply, q.dashboard)
          if (!scope) return reply
          const data = isoCodes(await unifiedClient.listDataCurrencies(scope, filterParams(q)))
          reply.header('cache-control', 'no-store')
          return { data }
        } catch (err) {
          return passUpstreamError(reply, err)
        }
      },
    )

    fastify.get<{
      Querystring: {
        vertical?: z.infer<typeof VerticalEnum>
        platform?: string
        search?: string
        dashboard?: string
        limit?: string
      }
    }>(
      '/api/dashboards/connections',
      {
        preHandler: [requirePermission('dashboards:view'), requirePermission('connections:read')],
        schema: {
          tags: [TAG],
          summary: 'List connections to filter a dashboard by',
          description: `The connections in your tenant scope that a dashboard's connection filter can offer, with the adapters among them — narrowed to \`vertical\`, to a stored dashboard's pinned tenants when \`dashboard\` is given (your scope ∩ its pins), to one adapter with \`platform\`, and by \`search\`, a case-insensitive substring of the connection id or label (an id prefix is enough). \`platforms\` lists the adapters of the vertical's connections you can see, with counts, ignoring \`search\` and \`platform\`. Connections carry only an id, a label, an adapter and a vertical: never a tenant id, a status or a credential, and a connection outside your scope is absent even when searched for by its exact id. \`limit\` caps the list (default ${DASHBOARD_CONNECTIONS_DEFAULT_LIMIT}, at most ${DASHBOARD_CONNECTIONS_MAX_LIMIT}; other values are clamped); \`total\` counts every match. Requires \`dashboards:view\` and \`connections:read\`. \`400\` for an unknown vertical or a malformed adapter, \`404\` for a dashboard you cannot see.`,
          operationId: 'dashboards.connections.list',
          querystring: z.object({
            vertical: VerticalEnum.optional(),
            platform: PlatformParam.optional(),
            search: z.string().max(200).optional().meta({
              description:
                'Case-insensitive substring of the connection id or label; an exact id is listed first.',
              example: 'acme',
            }),
            dashboard: DashboardQuery,
            limit: z
              .string()
              .optional()
              .meta({
                description: `How many connections to list: 1–${DASHBOARD_CONNECTIONS_MAX_LIMIT}, default ${DASHBOARD_CONNECTIONS_DEFAULT_LIMIT}.`,
                example: '50',
              }),
          }),
          response: {
            200: dataEnvelope(DashboardConnections),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const q = request.query ?? {}
        const narrowed = await accessScopeForDashboard(request, reply, q.dashboard)
        if (!narrowed) return reply
        // Scope first, before any filter or count, as `/api/connections` does:
        // neither the list, the counts nor `total` may reflect a connection
        // the caller cannot see.
        const visible = (await unifiedClient.listConnections()).filter(
          (c) =>
            typeof c.id === 'string' &&
            typeof c.platform === 'string' &&
            !!c.vertical &&
            (!q.vertical || c.vertical === q.vertical) &&
            scopeAllows(narrowed.scope, c.tenantId, c.vertical),
        )
        const names = await platformNameIndex()
        const byPlatform = new Map<string, { slug: string; name: string; count: number }>()
        for (const c of visible) {
          const p = byPlatform.get(c.platform)
          if (p) p.count++
          else {
            const name = names.get(`${c.vertical}/${c.platform}`) ?? c.platform
            byPlatform.set(c.platform, { slug: c.platform, name, count: 1 })
          }
        }
        const search = q.search?.trim().toLowerCase() ?? ''
        const matches = visible
          .filter((c) => !q.platform || c.platform === q.platform)
          .map((c) => ({ c, rank: search ? searchRank(c, search) : 1 }))
          .filter((m) => m.rank > 0)
          .sort((a, b) => {
            if (a.rank !== b.rank) return b.rank - a.rank
            const al = a.c.label?.trim() ?? ''
            const bl = b.c.label?.trim() ?? ''
            if (!al !== !bl) return al ? -1 : 1
            return (
              al.localeCompare(bl, undefined, { sensitivity: 'base' }) ||
              a.c.id.localeCompare(b.c.id)
            )
          })
        const asked = parseInt(q.limit ?? '', 10)
        const limit = Number.isFinite(asked)
          ? Math.min(Math.max(1, asked), DASHBOARD_CONNECTIONS_MAX_LIMIT)
          : DASHBOARD_CONNECTIONS_DEFAULT_LIMIT
        reply.header('cache-control', 'no-store')
        return {
          data: {
            connections: matches.slice(0, limit).map(({ c }) => ({
              id: c.id,
              label: c.label ?? null,
              platform: c.platform,
              vertical: c.vertical,
            })),
            platforms: [...byPlatform.values()].sort((a, b) => a.slug.localeCompare(b.slug)),
            total: matches.length,
          },
        }
      },
    )

    fastify.get<{ Params: { id: string } }>(
      '/api/dashboards/:id',
      {
        preHandler: [requirePermission('dashboards:view')],
        schema: {
          tags: [TAG],
          summary: 'Read one dashboard',
          description:
            'A built-in dashboard, or one shared with you. Requires `dashboards:view`. `404` for an unknown id or a dashboard not shared with you.',
          operationId: 'dashboards.get',
          params: IdParam,
          response: {
            200: dataEnvelope(Dashboard),
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const builtin = getBuiltinDashboard(request.params.id)
        if (builtin) return { data: builtinView(builtin) }
        const d = await dashboards.get(request.params.id)
        const viewer = await viewerOf(request)
        if (!d || !canSeeDashboard(viewer, d)) {
          return reply.status(404).send({ error: 'Dashboard not found' })
        }
        return { data: storedView(d, canEditDashboard(viewer, d), viewer) }
      },
    )

    fastify.post<{ Body: z.infer<typeof CreateBody> }>(
      '/api/dashboards',
      {
        preHandler: [requirePermission('dashboards:edit')],
        schema: {
          tags: [TAG],
          summary: 'Create a dashboard',
          description: `Create a dashboard from up to ${MAX_WIDGETS} widgets, each naming a catalog metric, a chart type and a width (1–12 columns). Shared per \`audience\` (default \`private\`); \`everyone\` needs \`dashboards:share_all\`, and a caller with restricted access may share with and pin only tenants in that access (\`403\`). Requires \`dashboards:edit\`. \`400\` for a metric not in your catalog, a chart that is not one of its metric's \`charts\` (\`Chart <chart> does not fit <metric>\`) or an unknown tenant. Writes \`dashboard.create\` and, when shared or pinned, \`dashboard.share\` audit entries.`,
          operationId: 'dashboards.create',
          body: CreateBody,
          response: {
            201: dataEnvelope(Dashboard),
            400: errorBody,
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async (request, reply) => {
        const body = request.body
        const widgets = normaliseWidgets(body.widgets)
        const layout = await layoutRefusal(request, widgets)
        if (layout) return reply.status(400).send({ error: layout })
        const audience: Audience = body.audience ? toAudience(body.audience) : { kind: 'private' }
        const pinnedTenants = normalisePins(body.pinnedTenants)
        const refusal = await sharingRefusal(
          request,
          { audience, pinnedTenants },
          { audience, pinnedTenants },
          { audience: { kind: 'private' }, pinnedTenants: null },
        )
        if (refusal) return reply.status(refusal.status).send({ error: refusal.error })
        const d = await dashboards.create({
          name: body.name,
          description: body.description ?? null,
          widgets,
          audience,
          pinnedTenants,
          ownerUserId: request.jwtUser!.id,
        })
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'dashboard.create',
          targetId: d.id,
          detail: { name: d.name },
        })
        await auditShare(request, d, { audience: { kind: 'private' }, pinnedTenants: null })
        return reply.status(201).send({ data: storedView(d, true, await viewerOf(request)) })
      },
    )

    fastify.patch<{ Params: { id: string }; Body: z.infer<typeof UpdateBody> }>(
      '/api/dashboards/:id',
      {
        preHandler: [requirePermission('dashboards:edit')],
        schema: {
          tags: [TAG],
          summary: 'Edit a dashboard',
          description:
            'Edit your own dashboard (admins may edit any); omitted fields are unchanged. Requires `dashboards:edit`. `409` for a built-in dashboard, `403` for someone else’s or a sharing change you may not make, `400` for an unknown tenant, a metric not in your catalog or a chart that does not fit its metric, `404` when it does not exist or is not visible to you. Writes a `dashboard.update` audit entry, and `dashboard.share` when the audience or pins change.',
          operationId: 'dashboards.update',
          params: IdParam,
          body: UpdateBody,
          response: {
            200: dataEnvelope(Dashboard),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        if (getBuiltinDashboard(request.params.id)) {
          return reply.status(409).send({ error: 'Built-in dashboards cannot be changed' })
        }
        const existing = await dashboards.get(request.params.id)
        const viewer = await viewerOf(request)
        if (!existing || !canSeeDashboard(viewer, existing)) {
          return reply.status(404).send({ error: 'Dashboard not found' })
        }
        if (!canEditDashboard(viewer, existing)) {
          return reply
            .status(403)
            .send({ error: 'Only the owner or an admin can edit this dashboard' })
        }
        const body = request.body
        const widgets = body.widgets ? normaliseWidgets(body.widgets) : undefined
        if (widgets) {
          const layout = await layoutRefusal(request, widgets)
          if (layout) return reply.status(400).send({ error: layout })
        }
        const nextAudience = body.audience ? toAudience(body.audience) : existing.audience
        const nextPins =
          body.pinnedTenants !== undefined
            ? normalisePins(body.pinnedTenants)
            : existing.pinnedTenants
        const changed = {
          ...(sameAudience(nextAudience, existing.audience) ? {} : { audience: nextAudience }),
          ...(samePins(nextPins, existing.pinnedTenants) ? {} : { pinnedTenants: nextPins }),
        }
        const refusal = await sharingRefusal(
          request,
          changed,
          { audience: nextAudience, pinnedTenants: nextPins },
          { audience: existing.audience, pinnedTenants: existing.pinnedTenants },
        )
        if (refusal) return reply.status(refusal.status).send({ error: refusal.error })
        const updated = await dashboards.update(existing.id, {
          name: body.name,
          description: body.description,
          widgets,
          ...changed,
        })
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'dashboard.update',
          targetId: existing.id,
          detail: { name: updated!.name },
        })
        await auditShare(request, updated!, existing)
        return { data: storedView(updated!, true, viewer) }
      },
    )

    fastify.delete<{ Params: { id: string } }>(
      '/api/dashboards/:id',
      {
        preHandler: [requirePermission('dashboards:edit')],
        schema: {
          tags: [TAG],
          summary: 'Delete a dashboard',
          description:
            'Delete your own dashboard (admins may delete any). Requires `dashboards:edit`. `409` for a built-in, `403` for someone else’s, `404` when it does not exist. Writes a `dashboard.delete` audit entry.',
          operationId: 'dashboards.delete',
          params: IdParam,
          response: {
            204: noContent,
            401: errorBody,
            403: errorBody,
            404: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        if (getBuiltinDashboard(request.params.id)) {
          return reply.status(409).send({ error: 'Built-in dashboards cannot be deleted' })
        }
        const existing = await dashboards.get(request.params.id)
        const viewer = await viewerOf(request)
        if (!existing || !canSeeDashboard(viewer, existing)) {
          return reply.status(404).send({ error: 'Dashboard not found' })
        }
        if (!canEditDashboard(viewer, existing)) {
          return reply
            .status(403)
            .send({ error: 'Only the owner or an admin can delete this dashboard' })
        }
        await dashboards.delete(existing.id)
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'dashboard.delete',
          targetId: existing.id,
          detail: { name: existing.name },
        })
        return reply.status(204).send()
      },
    )
  }
}
