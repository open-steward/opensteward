/**
 * Docsign metrics against hand-computed values. SQLite always, Postgres when
 * TEST_DATABASE_URL is set. Only `envelopes` and `templates` are synced.
 *
 * "Now" is Wednesday 2026-03-18 12:00 UTC; the range is 2026-03-01 to 2026-03-15.
 *
 *  id  status     sender tmpl  created  sent         delivered    done              expires
 *  e1  completed  s1     tm1   03-01    03-01 09:00  03-01 11:00  03-03 09:00       -
 *  e2  completed  s1     tm1   03-02    03-02 00:00  03-02 06:00  03-06 00:00       -
 *  e3  completed  s2     tm2   03-03    03-03 00:00  03-04 00:00  03-13 00:00       -
 *  e4  declined   s2     tm2   03-04    03-04 00:00  03-04 02:00  declined 03-05    -
 *  e5  voided     s1     -     03-05    03-05        -            voided 03-07      -
 *  e6  expired    s3     tm1   03-06    03-06        -            (updated 03-16)   03-16
 *  e7  sent       s1     tm1   03-08    03-08        -            -                 03-20
 *  e8  delivered  s2     tm2   02-20    02-20        02-21        -                 03-18
 *  e9  draft      s1     -     01-15
 *  e10 draft      s3     -     03-10
 *  e11 sent       s3     tm1   03-16    03-16        -            -                 04-15
 *  e12 completed  s1     tm1   02-10    02-10        -            02-12
 *  e13 delivered  s3     -     02-25    03-04 00:00  -            -                 -   (exactly 14 days)
 *  e14 delivered  s3     -     02-25    03-03 00:00  -            -                 -   (15 days)
 *
 * Tenant-b has a template with tm1's id and another name.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { RESOURCE_METRICS } from '../../src/data-access/metrics/catalog'
import {
  BACKENDS,
  SCOPE_B,
  kpi,
  nonZero,
  openHarness,
  points,
  rowsByLabel,
  type Harness,
  type Row,
} from './metrics-harness'

const RANGE = { from: '2026-03-01', to: '2026-03-15' }
const FAR_PAST = { from: '2024-01-01', to: '2024-01-31' }

const env = (
  id: string,
  status: string,
  senderId: string,
  extra: Record<string, unknown> = {},
): Row => ({
  id,
  status,
  senderId,
  subject: `subject ${id}`,
  signingOrder: 'sequential',
  signerIds: [],
  documentIds: [],
  ...extra,
})

const ENVELOPES: Row[] = [
  env('e1', 'completed', 's1', {
    templateId: 'tm1',
    createdAt: '2026-03-01T08:00:00Z',
    sentAt: '2026-03-01T09:00:00Z',
    deliveredAt: '2026-03-01T11:00:00Z',
    completedAt: '2026-03-03T09:00:00Z',
    updatedAt: '2026-03-03T09:00:00Z',
  }),
  env('e2', 'completed', 's1', {
    templateId: 'tm1',
    createdAt: '2026-03-02T00:00:00Z',
    sentAt: '2026-03-02T00:00:00Z',
    deliveredAt: '2026-03-02T06:00:00Z',
    completedAt: '2026-03-06T00:00:00Z',
    updatedAt: '2026-03-06T00:00:00Z',
  }),
  env('e3', 'completed', 's2', {
    templateId: 'tm2',
    createdAt: '2026-03-03T00:00:00Z',
    sentAt: '2026-03-03T00:00:00Z',
    deliveredAt: '2026-03-04T00:00:00Z',
    completedAt: '2026-03-13T00:00:00Z',
    updatedAt: '2026-03-13T00:00:00Z',
  }),
  env('e4', 'declined', 's2', {
    templateId: 'tm2',
    createdAt: '2026-03-04T00:00:00Z',
    sentAt: '2026-03-04T00:00:00Z',
    deliveredAt: '2026-03-04T02:00:00Z',
    declinedAt: '2026-03-05T00:00:00Z',
    updatedAt: '2026-03-05T00:00:00Z',
  }),
  env('e5', 'voided', 's1', {
    createdAt: '2026-03-05T00:00:00Z',
    sentAt: '2026-03-05T00:00:00Z',
    voidedAt: '2026-03-07T00:00:00Z',
    updatedAt: '2026-03-07T00:00:00Z',
  }),
  env('e6', 'expired', 's3', {
    templateId: 'tm1',
    createdAt: '2026-03-06T00:00:00Z',
    sentAt: '2026-03-06T00:00:00Z',
    expiresAt: '2026-03-16T00:00:00Z',
    updatedAt: '2026-03-16T00:00:00Z',
  }),
  env('e7', 'sent', 's1', {
    templateId: 'tm1',
    createdAt: '2026-03-08T00:00:00Z',
    sentAt: '2026-03-08T00:00:00Z',
    expiresAt: '2026-03-20T00:00:00Z',
    updatedAt: '2026-03-08T00:00:00Z',
  }),
  env('e8', 'delivered', 's2', {
    templateId: 'tm2',
    createdAt: '2026-02-20T00:00:00Z',
    sentAt: '2026-02-20T00:00:00Z',
    deliveredAt: '2026-02-21T00:00:00Z',
    expiresAt: '2026-03-18T00:00:00Z',
    updatedAt: '2026-02-21T00:00:00Z',
  }),
  env('e9', 'draft', 's1', { createdAt: '2026-01-15T00:00:00Z' }),
  env('e10', 'draft', 's3', { createdAt: '2026-03-10T00:00:00Z' }),
  env('e11', 'sent', 's3', {
    templateId: 'tm1',
    createdAt: '2026-03-16T00:00:00Z',
    sentAt: '2026-03-16T00:00:00Z',
    expiresAt: '2026-04-15T00:00:00Z',
  }),
  env('e13', 'delivered', 's3', {
    createdAt: '2026-02-25T00:00:00Z',
    sentAt: '2026-03-04T00:00:00Z',
    updatedAt: '2026-03-04T00:00:00Z',
  }),
  env('e14', 'delivered', 's3', {
    createdAt: '2026-02-25T00:00:00Z',
    sentAt: '2026-03-03T00:00:00Z',
    updatedAt: '2026-03-03T00:00:00Z',
  }),
  env('e12', 'completed', 's1', {
    templateId: 'tm1',
    createdAt: '2026-02-10T00:00:00Z',
    sentAt: '2026-02-10T00:00:00Z',
    completedAt: '2026-02-12T00:00:00Z',
    updatedAt: '2026-02-12T00:00:00Z',
  }),
]

describe.each(BACKENDS)('docsign metrics ($name)', (backend) => {
  let h: Harness

  beforeEach(async () => {
    h = await openHarness(backend)
    const a = await h.connect('docusign', 'docsign', 'tenant-a', 'Docs A')
    const b = await h.connect('docusign', 'docsign', 'tenant-b', 'Docs B')
    await h.put('docsign', 'docusign', a, 'templates', [
      { id: 'tm1', name: 'MSA' },
      { id: 'tm2', name: 'NDA' },
    ])
    await h.put('docsign', 'docusign', a, 'envelopes', ENVELOPES)
    await h.put('docsign', 'docusign', b, 'templates', [
      { id: 'tm1', name: 'LEAKED-TPL' },
    ])
    await h.put('docsign', 'docusign', b, 'envelopes', [
      env('eb1', 'completed', 'sb', {
        templateId: 'tm1',
        createdAt: '2026-03-02T00:00:00Z',
        sentAt: '2026-03-02T00:00:00Z',
        completedAt: '2026-03-04T00:00:00Z',
        updatedAt: '2026-03-04T00:00:00Z',
      }),
    ])
  })

  afterEach(async () => {
    await h.handle.close()
  })

  it('registers every docsign id under its own vertical', () => {
    const own = RESOURCE_METRICS.filter((m) => m.vertical === 'docsign')
    expect(own.length).toBeGreaterThanOrEqual(20)
    for (const m of own) expect(m.id.startsWith('docsign.')).toBe(true)
  })

  describe('volume', () => {
    it('counts sent, completed, declined and voided envelopes per day', async () => {
      const sent = await h.run('docsign.envelopes_sent_per_day', RANGE)
      expect(sent.value).toBe(9) // e1–e7, e13, e14; e8 and e12 were sent earlier, e11 later
      expect(nonZero(sent)).toEqual({
        '2026-03-01': 1,
        '2026-03-02': 1,
        '2026-03-03': 2,
        '2026-03-04': 2,
        '2026-03-05': 1,
        '2026-03-06': 1,
        '2026-03-08': 1,
      })
      expect(nonZero(await h.run('docsign.envelopes_completed_per_day', RANGE))).toEqual({
        '2026-03-03': 1,
        '2026-03-06': 1,
        '2026-03-13': 1,
      })
      expect(nonZero(await h.run('docsign.envelopes_declined_per_day', RANGE))).toEqual({ '2026-03-05': 1 })
      expect(nonZero(await h.run('docsign.envelopes_voided_per_day', RANGE))).toEqual({ '2026-03-07': 1 })
      expect((await h.run('docsign.envelopes_created_per_day', RANGE)).value).toBe(8)
    })

    it('splits finished envelopes per day by outcome', async () => {
      const r = await h.run('docsign.outcomes_per_day', RANGE)
      expect(nonZero(r, 'completed')).toEqual({ '2026-03-03': 1, '2026-03-06': 1, '2026-03-13': 1 })
      expect(nonZero(r, 'declined')).toEqual({ '2026-03-05': 1 })
      expect(nonZero(r, 'voided')).toEqual({ '2026-03-07': 1 })
      // e6 (expired) was updated on 03-16, after the range
      expect(r.value).toBe(5)
      expect(r.metric.charts).toContain('stacked_bar')
    })

    it('counts envelopes by status in lifecycle order and those in flight now', async () => {
      const r = await h.run('docsign.envelopes_by_status', RANGE)
      expect(points(r)).toEqual({
        draft: 1,
        sent: 1,
        delivered: 0,
        completed: 3,
        declined: 1,
        voided: 1,
        expired: 1,
        unknown: 0,
      })
      expect(r.metric.charts).toContain('funnel')
      // sent or delivered now: e7, e8, e11, e13, e14 — whatever the range
      expect((await h.run('docsign.in_flight', RANGE)).value).toBe(5)
      expect((await h.run('docsign.in_flight', FAR_PAST)).value).toBe(5)
    })
  })

  describe('outcome rates count finished envelopes only', () => {
    it('rates completion, decline and voided/expired by sent cohort', async () => {
      // sent 03-01…03-15 and finished: e1 e2 e3 completed, e4 declined, e5 voided, e6 expired.
      // e7 is still out for signature and is not in any denominator.
      const c = await h.run('docsign.completion_rate', RANGE)
      expect(kpi(c, 'numerator')).toBe(3)
      expect(kpi(c, 'denominator')).toBe(6)
      expect(c.value).toBe(50)
      expect((await h.run('docsign.decline_rate', RANGE)).value).toBe(16.67)
      expect((await h.run('docsign.voided_expired_rate', RANGE)).value).toBe(33.33)
    })

    it('trends the decline rate by day', async () => {
      const r = await h.run('docsign.decline_rate_trend', RANGE)
      expect(r.value).toBe(16.67)
      const day = Object.fromEntries(r.series[0]!.points.map((p) => [p.x, p.y]))
      expect(day['2026-03-04']).toBe(100) // e4 alone that day
      expect(day['2026-03-01']).toBe(0)
      expect(day['2026-03-08']).toBeNull() // e7 is not finished: no denominator
    })

    it('rates template use over envelopes created in the range', async () => {
      const r = await h.run('docsign.templates_used', RANGE)
      // e1 e2 e3 e4 e6 e7 have a template; e5 and e10 do not
      expect(kpi(r, 'numerator')).toBe(6)
      expect(kpi(r, 'denominator')).toBe(8)
      expect(r.value).toBe(75)
    })
  })

  describe('speed', () => {
    it('computes time to complete by hand', async () => {
      const r = await h.run('docsign.time_to_complete', RANGE)
      // sent → completed in days: e1 2, e2 4, e3 10. e12 completed before the range.
      expect(kpi(r, 'n')).toBe(3)
      expect(kpi(r, 'mean')).toBe(5.33)
      expect(r.value).toBe(4) // headline: median
      expect(kpi(r, 'p90')).toBe(8.8) // 4 + 0.8 × (10 − 4)
      // <1, 1–2, 2–3, 3–5, 5–7, 7–14, 14–30, ≥30
      expect(r.series[0]!.points.map((p) => p.y)).toEqual([0, 0, 1, 1, 0, 1, 0, 0])
    })

    it('gives a boxplot row per template name, from the in-scope connection', async () => {
      const r = await h.run('docsign.time_to_complete_by_template', RANGE)
      expect(r.metric.charts[0]).toBe('boxplot')
      const by = Object.fromEntries(r.stats!.map((s) => [s.group, s]))
      expect(by['MSA']).toMatchObject({ n: 2, min: 2, p50: 3, max: 4, mean: 3 })
      expect(by['NDA']).toMatchObject({ n: 1, p50: 10 })
      expect(JSON.stringify(r)).not.toContain('LEAKED')
      const b = await h.run('docsign.time_to_complete_by_template', RANGE, SCOPE_B)
      expect(b.stats!.map((s) => s.group)).toContain('LEAKED-TPL')
    })

    it('computes time to first view in hours', async () => {
      const r = await h.run('docsign.time_to_first_view', RANGE)
      // sent → delivered in hours: e1 2, e4 2, e2 6, e3 24. e8 was delivered on 02-21.
      expect(kpi(r, 'n')).toBe(4)
      expect(kpi(r, 'mean')).toBe(8.5)
      expect(r.value).toBe(4) // median (2 + 6) / 2
      expect(kpi(r, 'p90')).toBe(18.6) // 6 + 0.7 × (24 − 6)
      // <1, 1–4, 4–24, 24–48, 48–72, 72–168, ≥168
      expect(r.series[0]!.points.map((p) => p.y)).toEqual([0, 2, 1, 1, 0, 0, 0])
      expect(r.metric.unit).toBe('hours')
    })
  })

  describe('activity', () => {
    it('groups envelopes by template name and by sender id', async () => {
      const t = await h.run('docsign.envelopes_by_template', RANGE)
      expect(points(t)).toEqual({ MSA: 4, NDA: 2, '(none)': 2 })
      expect(JSON.stringify(t)).not.toContain('LEAKED')
      expect(points(await h.run('docsign.envelopes_by_template', RANGE, SCOPE_B))).toEqual({
        'LEAKED-TPL': 1,
      })
      expect(points(await h.run('docsign.envelopes_by_sender', RANGE))).toEqual({ s1: 4, s2: 2, s3: 2 })
    })

    it('ages pending envelopes as of now', async () => {
      for (const range of [RANGE, FAR_PAST]) {
        const r = await h.run('docsign.pending_by_age', range)
        // days since sent: e11 2, e7 10, e13 14, e14 15, e8 26
        expect(r.series[0]!.points).toEqual([
          { x: '0–2 days', y: 1 },
          { x: '3–7 days', y: 0 },
          { x: '8–14 days', y: 2 },
          { x: '15–30 days', y: 2 },
          { x: '31+ days', y: 0 },
        ])
      }
    })
  })

  describe('risk', () => {
    it('buckets envelopes by days until they expire', async () => {
      const r = await h.run('docsign.expiring_soon', RANGE)
      // days until expiry: e8 0, e7 2, e11 28; e13 and e14 have no expiry date
      expect(r.series[0]!.points).toEqual([
        { x: 'Today or past', y: 1 },
        { x: '1–3 days', y: 1 },
        { x: '4–7 days', y: 0 },
        { x: '8–14 days', y: 0 },
        { x: '15+ days', y: 1 },
        { x: 'No date', y: 2 },
      ])
    })

    it('finds stuck envelopes and stale drafts with now-relative filters', async () => {
      // in flight and sent before 03-04: e8 (02-20) and e14 (03-03, 15 days). e13 was sent exactly
      // 14 days ago; e7 (03-08) and e11 (03-16) are recent.
      expect((await h.run('docsign.stuck', RANGE)).value).toBe(2)
      // drafts created before 02-16: e9 (01-15); e10 is from 03-10
      expect((await h.run('docsign.stale_drafts', RANGE)).value).toBe(1)
      expect((await h.run('docsign.stale_drafts', FAR_PAST)).value).toBe(1)
    })

    it('measures sender concentration by id', async () => {
      const r = await h.run('docsign.sender_concentration', RANGE)
      // sent in range: s1 e1 e2 e5 e7, s2 e3 e4, s3 e6 e13 e14 → 4, 2, 3 of 9
      expect(r.value).toBe(44.44)
      expect(kpi(r, 'top3_share')).toBe(100)
      expect(kpi(r, 'hhi')).toBe(3580) // (16 + 4 + 9) / 81
      expect(kpi(r, 'effective_n')).toBe(2.79)
      expect(rowsByLabel(r)['s1']).toMatchObject({ rank: 1, value: 4, share: 44.44 })
    })
  })
})
