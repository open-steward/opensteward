/**
 * The dashboard's "Needs attention" panel — derived per request, never stored.
 *
 * Five kinds of task, each a condition the operator has to do something
 * about, each derived from data the dashboard already loads (connections,
 * the verticals' health) plus two best-effort sync-job reads:
 *
 *   vertical_down    a vertical whose backend is not answering; one row per
 *                    vertical, never clearable, never behind the cap — it is
 *                    the one row that explains why the rest of the page
 *                    cannot be trusted. When EVERY vertical is down the rows
 *                    collapse into one for the integration server: admin-api
 *                    makes a single /health call and marks all nine down
 *                    together, so that is the shape a real outage takes, and
 *                    nine identical rows would bury the page
 *   platform_creds   a platform rejected the operator's OAuth client
 *                    credentials; one row per vertical/platform, since one bad
 *                    secret breaks every connection for that platform
 *   conn_expired     a connection the customer must re-authorise
 *   sync_failed      the newest failed sync for a connection, with no later
 *                    attempt of any status
 *   refresh_failing  an early warning: a connection that still works, whose
 *                    last token refresh failed. Not yet broken, but it will
 *                    be at its expiry unless a refresh succeeds first
 *
 * Two rules keep the panel honest rather than merely present:
 *
 *   - Re-auth creates a NEW connection row and the old, expired one never
 *     changes. An expired connection with a newer valid sibling (same
 *     vertical/platform/tenant) is therefore not a task; it is a leftover,
 *     and the row it would have produced would outlive every reconnect.
 *   - A failed sync on an expired or platform_error connection is the same
 *     root cause. It is folded into that connection's row and Retry is
 *     withheld — a retry there is guaranteed to fail.
 *
 * Clearing is deployment-wide and clear-once (see admin-api's dashboard-tasks
 * routes). A task is hidden while a clear exists with the same key AND the
 * same fingerprint; the fingerprint moves only when the condition itself
 * changes, so a recurrence re-surfaces the row. The fingerprint format is
 * documented on `DashboardDismissal` in admin-api's `db/admin-store.ts` and
 * derived there too (the health poller honours clears); the two MUST agree,
 * which is why `dashboardTaskFingerprint` is copied here verbatim.
 *
 * Who may do what is one table, `KIND_MIN_ROLE`, so the answer to "should
 * operators be able to clear platform rows?" is a one-line change.
 */
import type {
  DashboardDismissalRecord,
  SyncJobRecord,
  TaggedConnection,
  VerticalStatus,
} from '../proxy/admin-api-client'
import { VERTICAL_LABELS, isKnownVertical } from '../verticals'

export type { DashboardDismissalRecord }

export type DashboardTaskKind =
  'vertical_down' | 'platform_creds' | 'conn_expired' | 'refresh_failing' | 'sync_failed'
export type DashboardRole = 'viewer' | 'operator' | 'admin'

/**
 * The minimum role for the row's primary action and for clearing it. Every
 * role sees every row — the panel is the deployment's to-do list, and a
 * viewer reading "3 expired connections" is the point of having one.
 *
 * `platform_creds` is admin on both: the fix lives under `/platforms`, which
 * is admin-only in its entirety, and admin-api refuses an operator's clear
 * of a `platform:creds:*` key outright — so the UI hop must agree, or the
 * button 403s one layer down.
 *
 * `vertical_down` is admin to act (the link goes to `/settings/system`,
 * admin-only) and `null` to clear: nobody clears it. A vertical that is
 * down is not a to-do anyone can decide to stop seeing, and admin-api does
 * not accept the key.
 */
export const KIND_MIN_ROLE: Record<
  DashboardTaskKind,
  { act: DashboardRole; clear: DashboardRole | null }
> = {
  vertical_down: { act: 'admin', clear: null },
  platform_creds: { act: 'admin', clear: 'admin' },
  conn_expired: { act: 'operator', clear: 'operator' },
  refresh_failing: { act: 'operator', clear: 'operator' },
  sync_failed: { act: 'operator', clear: 'operator' },
}

/** Rows shown before the rest collapse into an "and N more" link. */
export const TASK_ROW_CAP = 8

/** How long after a clear the panel still offers Undo for it. */
export const UNDO_WINDOW_MS = 15 * 60 * 1000

/** The literal `markFailed` reason integration-server writes for an admin cancel. */
const CANCELLED_BY_ADMIN = 'cancelled by admin'

const ROLE_LEVEL: Record<DashboardRole, number> = { viewer: 0, operator: 1, admin: 2 }

export interface DashboardTask {
  kind: DashboardTaskKind
  /** `vertical:down:<vertical>` (or `vertical:down:all` for the collapsed
   *  row), `conn:expired:<id>`, `platform:creds:<vertical>/<platform>`,
   *  `refresh:failing:<id>` or `sync:failed:<jobId>`. */
  key: string
  fingerprint: string
  /** Empty for the collapsed `vertical:down:all` row, which is every vertical. */
  vertical: string
  /** Empty for a `vertical_down` row, which has no platform. */
  platform: string
  /** The catalogue's display name (`Fortnox`), or the slug when the caller
   *  gave no resolver. What the row and its accessible names say. Empty for
   *  a `vertical_down` row. */
  platformName: string
  /** Fed to `statusPill`: `down`, `expired`, `platform_error`, `refresh_failed` or `failed`. */
  status: string
  /** `label ?? id` for a connection row; the platform's display name for a
   *  platform row; the vertical's label for a `vertical_down` row, or
   *  `Integration server` for the collapsed one. */
  title: string
  connectionId: string | null
  tenantId: string | null
  /** One plain sentence saying what happened. */
  sentence: string
  /** The failed sync — the row's subject for `sync_failed`, or the one folded
   *  into a connection row. Null when there is none. */
  job: { id: string; error: string | null } | null
  /** `platform_creds` only: how many connections the rejection broke. */
  affected: number
  /** `platform_creds` only: failed syncs folded into this row. */
  failedSyncs: number
  /** The caller's role clears `KIND_MIN_ROLE[kind].act`. */
  canAct: boolean
  /** The caller's role clears `KIND_MIN_ROLE[kind].clear`; never for a kind whose floor is null. */
  canClear: boolean
  /** Retry is offered only on a standalone `sync_failed` row the caller may act on. */
  canRetry: boolean
}

/** A task hidden by a clear recent enough that Undo is still worth offering. */
export interface RecentlyCleared {
  key: string
  kind: DashboardTaskKind
  platform: string
  platformName: string
  title: string
  /** Epoch ms. */
  clearedAt: number
  /** The caller's role may un-clear it (same floor as clearing). */
  canUndo: boolean
  /** That floor — what to name when `canUndo` is false. */
  undoRole: DashboardRole
}

export type DashboardUnavailable = 'sync' | 'dismissals'

export interface DashboardTasksInput {
  connections: readonly TaggedConnection[]
  /** Each vertical's health, as the dashboard already loads it. One not `up`
   *  is a `vertical_down` row, and its connections count as unknown. Default:
   *  none (the clear route, which only matches keys, does not pass them). */
  verticals?: readonly VerticalStatus[]
  /** `status=failed` jobs; null when the read failed (not when it answered 404). */
  failedJobs: readonly SyncJobRecord[] | null
  /** The newest jobs of any status; null when the read failed. */
  recentJobs: readonly SyncJobRecord[] | null
  /** Every clear; null when the read failed. */
  dismissals: readonly DashboardDismissalRecord[] | null
  role: DashboardRole
  /** Epoch ms; decides the Undo window. */
  now: number
  /** Rows to return before the rest count as hidden. Default `TASK_ROW_CAP`;
   *  the clear route passes `Infinity`, since the cap is a display choice
   *  and a key the form carried must match whether or not it fit the page. */
  cap?: number
  /** Display name for a platform, e.g. from the catalogue. Default: the slug. */
  platformName?: (vertical: string, platform: string) => string
}

export interface DashboardTasksOutput {
  /** At most `TASK_ROW_CAP` rows plus every `vertical_down` row, in display order. */
  tasks: DashboardTask[]
  /** Rows beyond the cap. */
  hidden: number
  /** Where "and N more" goes: the list holding most of what fell off the end. */
  hiddenHref: string
  /** Sources that could not be read. Distinct from empty on purpose: an
   *  outage must never render as "nothing needs attention". */
  unavailable: DashboardUnavailable[]
  /** Verticals whose connections could not have been listed — the ones not
   *  `up`. admin-api's aggregator swallows a backend outage to `[]`, so the
   *  connection list itself carries no signal; this is the honest one the
   *  page has, and "no expired connections" must not be said for these. */
  unavailableVerticals: string[]
  /** Every vertical (more than one) is down, i.e. the integration server is
   *  not answering: `tasks` holds the one collapsed row and the availability
   *  line should say "any connections", not list nine names. */
  allVerticalsDown: boolean
  /** Clears within `UNDO_WINDOW_MS` whose task is still live, for the Undo strip. */
  recentlyCleared: RecentlyCleared[]
}

/**
 * Normalise a timestamp-ish value into the fingerprint form: strict ISO 8601
 * for epoch-millis numbers and parseable strings, the raw string when it does
 * not parse, `''` when absent. A verbatim copy of admin-api's
 * `dashboardTaskFingerprint` — the poller and this module must agree.
 */
export function dashboardTaskFingerprint(value: string | number | null | undefined): string {
  if (value == null || value === '') return ''
  const ms = typeof value === 'number' ? value : Date.parse(value)
  if (!Number.isFinite(ms)) return String(value)
  return new Date(ms).toISOString()
}

/** Fingerprint of a `conn:expired:<id>` task: the expiry, else the immutable
 *  `createdAt` — never `updatedAt`, which a rename rewrites. */
function expiredFingerprint(c: Pick<TaggedConnection, 'expiresAt' | 'createdAt'>): string {
  return dashboardTaskFingerprint(c.expiresAt ?? c.createdAt)
}

/** Fingerprint of a `platform:creds:*` task: the newest expiry across the
 *  affected connections. A token expiry only moves when a refresh succeeded,
 *  so it holds still while the same rejected secret is retried. */
function platformCredsFingerprint(
  group: ReadonlyArray<Pick<TaggedConnection, 'expiresAt' | 'createdAt'>>,
): string {
  let newest = ''
  for (const c of group) {
    const fp = expiredFingerprint(c)
    if (fp > newest) newest = fp
  }
  return newest
}

const ms = (value: string | number | null | undefined): number => {
  const n = typeof value === 'number' ? value : value ? Date.parse(value) : NaN
  return Number.isFinite(n) ? n : 0
}

const isHealthy = (c: TaggedConnection) => c.status === 'valid' || c.status === 'expiring_soon'

const verticalLabel = (name: string) => (isKnownVertical(name) ? VERTICAL_LABELS[name] : name)

/** `2026-09-06 00:00 UTC` — a date in a sentence, without the milliseconds. */
function humanUtc(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return iso
  return new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
}

const siblingKey = (c: Pick<TaggedConnection, 'vertical' | 'platform' | 'tenantId'>) =>
  `${c.vertical}/${c.platform}/${c.tenantId ?? ''}`

/**
 * An expired connection with a newer healthy sibling is a leftover of a
 * re-auth, not a task.
 */
function supersededByReauth(
  c: TaggedConnection,
  byGroup: ReadonlyMap<string, readonly TaggedConnection[]>,
): boolean {
  const created = ms(c.createdAt)
  return (byGroup.get(siblingKey(c)) ?? []).some(
    (s) => s.id !== c.id && isHealthy(s) && ms(s.createdAt) > created,
  )
}

/**
 * The newest failed job per connection that is still the last word on that
 * connection: not cancelled by an admin, and with no later job of any status.
 */
function liveFailures(
  failedJobs: readonly SyncJobRecord[],
  recentJobs: readonly SyncJobRecord[],
): SyncJobRecord[] {
  const newestFailed = new Map<string, SyncJobRecord>()
  for (const j of failedJobs) {
    if (j.status !== 'failed') continue
    const cur = newestFailed.get(j.connectionId)
    if (!cur || ms(j.createdAt) > ms(cur.createdAt)) newestFailed.set(j.connectionId, j)
  }
  const out: SyncJobRecord[] = []
  for (const j of newestFailed.values()) {
    if (j.error === CANCELLED_BY_ADMIN) continue
    const created = ms(j.createdAt)
    const superseded = recentJobs.some(
      (r) => r.connectionId === j.connectionId && r.id !== j.id && ms(r.createdAt) > created,
    )
    if (!superseded) out.push(j)
  }
  return out
}

export function deriveDashboardTasks(input: DashboardTasksInput): DashboardTasksOutput {
  const { connections, role, now } = input
  const nameOf = input.platformName ?? ((_vertical: string, platform: string) => platform)
  const level = ROLE_LEVEL[role] ?? 0
  const allows = (kind: DashboardTaskKind, what: 'act' | 'clear') => {
    const floor = KIND_MIN_ROLE[kind][what]
    return floor !== null && level >= ROLE_LEVEL[floor]
  }
  const unavailable: DashboardUnavailable[] = []

  // vertical_down — one row per vertical that is not up, or one row for the
  // lot when none is; also the list of verticals whose connections the page
  // cannot vouch for.
  const verticals = input.verticals ?? []
  const downVerticals = verticals.filter((v) => v.status !== 'up')
  const unavailableVerticals = downVerticals.map((v) => v.name)
  const allVerticalsDown = downVerticals.length > 1 && downVerticals.length === verticals.length
  // The health check's own words — `connect ECONNREFUSED …` — are the one
  // diagnostic the page has, and the vertical cards below already print them
  // for every role, so the row does too rather than sending the reader to
  // hunt for them.
  const withError = (sentence: string, error: string | undefined) =>
    error ? `${sentence} (${error})` : sentence
  const downRow = (
    key: string,
    vertical: string,
    title: string,
    sentence: string,
  ): DashboardTask => ({
    kind: 'vertical_down',
    key,
    fingerprint: '',
    vertical,
    platform: '',
    platformName: '',
    status: 'down',
    title,
    connectionId: null,
    tenantId: null,
    sentence,
    job: null,
    affected: 0,
    failedSyncs: 0,
    canAct: allows('vertical_down', 'act'),
    canClear: false,
    canRetry: false,
  })
  const downRows: DashboardTask[] = allVerticalsDown
    ? [
        downRow(
          'vertical:down:all',
          '',
          'Integration server',
          withError(
            'The integration server is not answering — no vertical can be reached, so ' +
              'nothing below can say what state any connection or sync is in until it is back.',
            downVerticals[0]!.error,
          ),
        ),
      ]
    : downVerticals.map((v) => {
        const label = verticalLabel(v.name)
        return downRow(
          `vertical:down:${v.name}`,
          v.name,
          label,
          withError(
            `${label} is not answering — its connections, syncs and API calls cannot be ` +
              'reached, and nothing below can say what state they are in until it is back.',
            v.error,
          ),
        )
      })

  const byId = new Map<string, TaggedConnection>()
  const byGroup = new Map<string, TaggedConnection[]>()
  for (const c of connections) {
    byId.set(c.id, c)
    const k = siblingKey(c)
    const g = byGroup.get(k)
    if (g) g.push(c)
    else byGroup.set(k, [c])
  }

  // Sync jobs first, so a failed sync can be folded into the connection row
  // it belongs to. Either read failing means "no later job" cannot be
  // checked, and a Retry on a job that has since been retried is worse than
  // a line saying the check did not run.
  let failures: SyncJobRecord[] = []
  if (input.failedJobs === null || input.recentJobs === null) {
    unavailable.push('sync')
  } else {
    failures = liveFailures(input.failedJobs, input.recentJobs)
  }
  const foldedByConnection = new Map<string, SyncJobRecord>()
  const standalone: SyncJobRecord[] = []
  for (const j of failures) {
    const c = byId.get(j.connectionId)
    if (c && (c.status === 'expired' || c.status === 'platform_error')) {
      foldedByConnection.set(c.id, j)
    } else {
      standalone.push(j)
    }
  }

  // platform_creds — one row per vertical/platform.
  const platformGroups = new Map<string, TaggedConnection[]>()
  for (const c of connections) {
    if (c.status !== 'platform_error') continue
    const k = `${c.vertical}/${c.platform}`
    const g = platformGroups.get(k)
    if (g) g.push(c)
    else platformGroups.set(k, [c])
  }
  const platformRows: DashboardTask[] = [...platformGroups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, group]) => {
      const c = group[0]!
      const platformName = nameOf(c.vertical, c.platform)
      const failedSyncs = group.filter((g) => foldedByConnection.has(g.id)).length
      const n = group.length
      const sentence =
        `${platformName} rejected the OAuth client credentials — ${n} connection${n === 1 ? '' : 's'} ` +
        `blocked${failedSyncs ? ` and ${failedSyncs} sync${failedSyncs === 1 ? '' : 's'} failed` : ''}. ` +
        'Customer re-authorization will not fix this.'
      return {
        kind: 'platform_creds',
        key: `platform:creds:${k}`,
        fingerprint: platformCredsFingerprint(group),
        vertical: c.vertical,
        platform: c.platform,
        platformName,
        status: 'platform_error',
        title: platformName,
        connectionId: null,
        tenantId: null,
        sentence,
        job: null,
        affected: n,
        failedSyncs,
        canAct: allows('platform_creds', 'act'),
        canClear: allows('platform_creds', 'clear'),
        canRetry: false,
      }
    })

  // conn_expired — oldest expiry first.
  const expiredRows: DashboardTask[] = connections
    .filter((c) => c.status === 'expired' && !supersededByReauth(c, byGroup))
    .sort((a, b) => ms(a.expiresAt ?? a.createdAt) - ms(b.expiresAt ?? b.createdAt))
    .map((c) => {
      const folded = foldedByConnection.get(c.id) ?? null
      const sentence =
        'Authorization expired — the customer must complete a new Connect Link' +
        (folded ? '; the last sync failed because of it.' : '.')
      return {
        kind: 'conn_expired',
        key: `conn:expired:${c.id}`,
        fingerprint: expiredFingerprint(c),
        vertical: c.vertical,
        platform: c.platform,
        platformName: nameOf(c.vertical, c.platform),
        status: 'expired',
        title: c.label ?? c.id,
        connectionId: c.id,
        tenantId: c.tenantId,
        sentence,
        job: folded ? { id: folded.id, error: folded.error } : null,
        affected: 1,
        failedSyncs: folded ? 1 : 0,
        canAct: allows('conn_expired', 'act'),
        canClear: allows('conn_expired', 'clear'),
        canRetry: false,
      }
    })

  // sync_failed — newest first.
  const syncRows: DashboardTask[] = standalone
    .sort((a, b) => ms(b.createdAt) - ms(a.createdAt))
    .map((j) => {
      const c = byId.get(j.connectionId)
      const canAct = allows('sync_failed', 'act')
      return {
        kind: 'sync_failed',
        key: `sync:failed:${j.id}`,
        fingerprint: '',
        vertical: j.vertical,
        platform: j.platform,
        platformName: nameOf(j.vertical, j.platform),
        status: 'failed',
        title: c?.label ?? j.connectionId,
        connectionId: j.connectionId,
        tenantId: c?.tenantId ?? j.tenantId,
        sentence: j.error ? `The last sync failed: ${j.error}` : 'The last sync failed.',
        job: { id: j.id, error: j.error },
        affected: 1,
        failedSyncs: 1,
        canAct,
        canClear: allows('sync_failed', 'clear'),
        canRetry: canAct,
      }
    })

  // refresh_failing — still healthy, last refresh failed; soonest expiry first.
  const refreshRows: DashboardTask[] = connections
    .filter((c) => isHealthy(c) && c.lastRefreshStatus === 'failed')
    .sort((a, b) => ms(a.expiresAt) - ms(b.expiresAt))
    .map((c) => {
      const sentence =
        'Still working, but the last token refresh failed' +
        (c.expiresAt
          ? ` — it expires ${humanUtc(c.expiresAt)} unless a refresh succeeds first.`
          : '; it will expire unless a refresh succeeds first.')
      return {
        kind: 'refresh_failing',
        key: `refresh:failing:${c.id}`,
        // The expiry, as for an expired row — NOT `lastRefreshAt`. The
        // keep-alive worker retries every tick and stamps `lastRefreshAt` on
        // each failure, so a clear keyed on the attempt would last one tick
        // (and refuse outright when a tick landed between page load and the
        // click). The expiry moves only when a refresh succeeds, i.e. when
        // the condition resolves; a later recurrence then re-surfaces the row.
        fingerprint: expiredFingerprint(c),
        vertical: c.vertical,
        platform: c.platform,
        platformName: nameOf(c.vertical, c.platform),
        status: 'refresh_failed',
        title: c.label ?? c.id,
        connectionId: c.id,
        tenantId: c.tenantId,
        sentence,
        job: null,
        affected: 1,
        failedSyncs: 0,
        canAct: allows('refresh_failing', 'act'),
        canClear: allows('refresh_failing', 'clear'),
        canRetry: false,
      }
    })

  const all = [...platformRows, ...expiredRows, ...syncRows, ...refreshRows]

  // Clears: hide on key + fingerprint; keep the recent ones for Undo.
  const visible: DashboardTask[] = []
  const recentlyCleared: RecentlyCleared[] = []
  if (input.dismissals === null) {
    unavailable.push('dismissals')
    visible.push(...all)
  } else {
    const cleared = new Map(input.dismissals.map((d) => [d.key, d]))
    for (const t of all) {
      const d = cleared.get(t.key)
      if (!d || d.fingerprint !== t.fingerprint) {
        visible.push(t)
        continue
      }
      // `createdAt` is ISO 8601 on the wire (admin-api rewrites every
      // `createdAt` before serialising); `ms` tolerates a number too, and
      // an unparseable value reads as 0, i.e. too old to undo.
      const clearedAt = ms(d.createdAt)
      // Every clearable kind has a role floor; `t` was hidden by a clear, so
      // it is one of them.
      const undoRole = KIND_MIN_ROLE[t.kind].clear ?? 'admin'
      if (now - clearedAt <= UNDO_WINDOW_MS) {
        recentlyCleared.push({
          key: t.key,
          kind: t.kind,
          platform: t.platform,
          platformName: t.platformName,
          title: t.title,
          clearedAt,
          canUndo: t.canClear,
          undoRole,
        })
      }
    }
  }

  // Down verticals sit above the cap as well as above the rows: hiding one
  // behind "and N more — see expired connections" would bury the row that
  // says why the others cannot be trusted.
  const cap = input.cap ?? TASK_ROW_CAP
  const tasks = [...downRows, ...visible.slice(0, cap)]
  const overflow = visible.slice(cap)
  const counts = { sync: 0, expired: 0, refresh: 0 }
  for (const t of overflow) {
    if (t.kind === 'sync_failed') counts.sync++
    else if (t.kind === 'refresh_failing') counts.refresh++
    else counts.expired++
  }
  const hiddenHref =
    counts.sync > counts.expired && counts.sync > counts.refresh
      ? '/sync-jobs?status=failed'
      : counts.refresh > counts.expired
        ? '/connections'
        : '/connections?status=expired'

  return {
    tasks,
    hidden: overflow.length,
    hiddenHref,
    unavailable,
    unavailableVerticals,
    allVerticalsDown,
    recentlyCleared,
  }
}
