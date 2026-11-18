/**
 * Draws a dashboard (views/dashboards/view.ejs).
 *
 * Each `[data-widget]` names a metric, a chart type and its options
 * (`data-currency`, `data-granularity`, `data-compare`). Values come from the
 * admin UI's own JSON route (`/dashboards/metric/:id`), which proxies
 * admin-api with the session — the browser never talks to admin-api, and
 * values are always computed for the viewer's scope.
 *
 * Currencies are never combined: there is no FX data. A money result that
 * holds more than one currency is drawn as SMALL MULTIPLES — one mini chart,
 * number tile or table section per currency, each titled with its code and
 * each on its own axis. Nothing is stacked, shared or summed across
 * currencies, whatever the chart type. A money heatmap, which the engine
 * computes for one currency only, is fetched once per currency.
 *
 * Charts are drawn with ECharts (`/vendor/echarts.min.js`, same origin, SVG
 * renderer), in the design system's colours: series take `--chart-1…6` in
 * fixed order (never cycled — a count's 7th series folds into "Other", any
 * other extra series is drawn in the neutral "other" grey), magnitudes take
 * the one-hue sequential ramp `--chart-seq-1…5`, text and axes take the ink
 * and border tokens, and statuses take the status tokens. Tokens are re-read
 * when the theme changes (`os:themechange` from shell.js).
 *
 * One value axis per chart, always: a pareto draws each group's share and the
 * cumulative share on the same 0–100 % axis.
 *
 * The pure helpers at the top hold no DOM references and are exposed as
 * `window.__dashboardCharts` for tests/unit/dashboard-charts.test.ts; the
 * drawing below them is the only part that touches the page. Plain ES5, no
 * inline script: the page is served under a strict CSP.
 */
;(function (global) {
  'use strict'

  var UNKNOWN_CURRENCY = 'Unknown currency'
  var OTHER = 'Other'
  var NET = 'Net'
  var PALETTE_SIZE = 6
  /** Small multiples drawn per widget; the rest are named in a footnote. */
  var MAX_MULTIPLES = 8
  var CURRENCY_RE = /^[A-Z]{3}$/
  // The connection filter's values, as admin-api accepts them.
  var CONNECTION_RE = /^[A-Za-z0-9_-]{1,100}$/
  var PLATFORM_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
  var VERTICAL_RE = /^[a-z][a-z-]{1,40}$/

  // ── Pure helpers ───────────────────────────────────────────────────────

  function has(o, k) {
    return o !== null && o !== undefined && Object.prototype.hasOwnProperty.call(o, k)
  }

  function num(v) {
    return typeof v === 'number' && isFinite(v)
  }

  function currencyLabel(c) {
    return c ? c : UNKNOWN_CURRENCY
  }

  /**
   * HTML-escape text for an ECharts tooltip, which a custom formatter's string
   * is inserted as HTML. Group labels are synced third-party data (statuses,
   * tag and carrier names), so every label a formatter prints goes through here.
   */
  /**
   * Label text for a chart label (SVG text, never HTML). zrender writes it as
   * a text node, so escaping would print entities; instead anything that looks
   * like markup (`<` or `>` next to a tag) is shown with ‹ › — `< 10` and
   * `> 90` band labels stay as they are.
   */
  function plain(v) {
    var s = String(v)
    if (!/<\s*[A-Za-z!\/?]|[A-Za-z"'\/]\s*>/.test(s)) return s
    return s.replace(/</g, '‹').replace(/>/g, '›')
  }

  function esc(v) {
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function sameCurrency(a, b) {
    return (a === undefined ? null : a) === (b === undefined ? null : b)
  }

  /** Alphabetical, the unknown currency last — the engine's own order. */
  function sortCurrencies(list) {
    return list.slice().sort(function (a, b) {
      if (a === b) return 0
      if (a === null) return 1
      if (b === null) return -1
      return a < b ? -1 : 1
    })
  }

  function isMoney(result) {
    return !!(result && result.metric && result.metric.money)
  }

  /** Every currency a money result's series, totals and KPIs carry (null = unknown). */
  function currenciesOf(result) {
    var seen = []
    var out = []
    function add(c) {
      var v = c === undefined ? null : c
      if (seen.indexOf(v) === -1) {
        seen.push(v)
        out.push(v)
      }
    }
    var totals = result.totals || []
    totals.forEach(function (t) {
      add(t.currency)
    })
    var series = result.series || []
    series.forEach(function (s) {
      if (has(s, 'currency')) add(s.currency)
    })
    var kpis = result.kpis || []
    kpis.forEach(function (k) {
      if (has(k, 'currency')) add(k.currency)
    })
    return sortCurrencies(out)
  }

  function kpiValue(result, key) {
    var kpis = result.kpis || []
    for (var i = 0; i < kpis.length; i++) if (kpis[i].key === key) return kpis[i].value
    return null
  }

  /**
   * The headline `value` of one currency's slice of a result. The engine
   * leaves `value` null when a result spans several currencies; within one
   * currency it is the ratio, the days outstanding, the top-1 share or the
   * count of records banded.
   */
  function sliceValue(slice) {
    var kind = slice.metric.kind
    if (kind === 'ratio') return kpiValue(slice, 'ratio')
    if (kind === 'dso' || kind === 'dpo' || kind === 'ccc') {
      var own = kpiValue(slice, kind)
      if (own !== null) return own
      var kpis = slice.kpis || []
      for (var i = 0; i < kpis.length; i++) if (kpis[i].unit === 'days') return kpis[i].value
      return null
    }
    if (kind === 'concentration') {
      var top = kpiValue(slice, 'top1_share')
      if (top !== null) return top
      var rows = (slice.table && slice.table.rows) || []
      for (var j = 0; j < rows.length; j++) if (rows[j].rank === 1) return rows[j].share
      return null
    }
    if (kind === 'histogram') {
      var n = 0
      var series = slice.series || []
      series.forEach(function (s) {
        s.points.forEach(function (p) {
          if (num(p.y)) n += p.y
        })
      })
      return n
    }
    return null
  }

  /** One currency's part of a money result: its series, totals, KPIs and table rows. */
  function sliceResult(result, currency) {
    var label = currencyLabel(currency)
    var out = {}
    for (var k in result) if (has(result, k)) out[k] = result[k]
    out.currency = currency
    out.currencies = currency ? [currency] : []
    out.series = (result.series || []).filter(function (s) {
      return !has(s, 'currency') || sameCurrency(s.currency, currency)
    })
    if (result.totals) {
      out.totals = result.totals.filter(function (t) {
        return sameCurrency(t.currency, currency)
      })
    }
    if (result.kpis) {
      out.kpis = result.kpis.filter(function (x) {
        return !has(x, 'currency') || sameCurrency(x.currency, currency)
      })
    }
    if (result.table) {
      var hasCurrency = result.table.columns.some(function (c) {
        return c.key === 'currency'
      })
      if (hasCurrency) {
        out.table = {
          columns: result.table.columns.filter(function (c) {
            return c.key !== 'currency'
          }),
          rows: result.table.rows.filter(function (r) {
            return r.currency === label
          }),
        }
      }
    }
    if (result.previous) {
      out.previous = { value: null, range: result.previous.range }
      if (result.previous.totals) {
        out.previous.totals = result.previous.totals.filter(function (t) {
          return sameCurrency(t.currency, currency)
        })
      }
    }
    out.value = sliceValue(out)
    return out
  }

  /**
   * The parts a result is drawn as: one per currency for a money result that
   * holds several (small multiples), otherwise the result itself.
   * Each part is `{ currency, label, result }`; `label` is null for a single part.
   */
  function splitByCurrency(result) {
    if (!isMoney(result)) return [{ currency: null, label: null, result: result }]
    var currencies = currenciesOf(result)
    if (currencies.length === 0) {
      return [{ currency: result.currency || null, label: null, result: result }]
    }
    if (currencies.length === 1) {
      // Untitled, but drawn in its currency: axis, tooltip, labels and cells.
      return [{ currency: currencies[0], label: null, result: sliceResult(result, currencies[0]) }]
    }
    return currencies.map(function (c) {
      return { currency: c, label: currencyLabel(c), result: sliceResult(result, c) }
    })
  }

  /**
   * Whether a result must be fetched again once per currency to be drawn:
   * a money heatmap over several currencies (the engine refuses to put two
   * currencies in one matrix).
   */
  function needsCurrencyFanOut(result, chart) {
    return (
      chart === 'heatmap' &&
      isMoney(result) &&
      !result.matrix &&
      !result.currency &&
      (result.currencies || []).length >= 1
    )
  }

  /**
   * Which currencies a money heatmap is fetched for: at most MAX_MULTIPLES
   * codes, the rest named as dropped. The engine refuses a matrix only over
   * more than one currency, so a refusal with a single code means records
   * without a code are present too — those cannot be asked for by code.
   */
  function fanOutPlan(result) {
    var codes = (result.currencies || []).filter(function (c) {
      return CURRENCY_RE.test(c)
    })
    return {
      fetch: codes.slice(0, MAX_MULTIPLES),
      dropped: codes.slice(MAX_MULTIPLES),
      unknownLeftOut: codes.length === 1,
    }
  }

  /** Footnote lines for what a fan-out could not show. */
  function fanOutNotes(plan, failed) {
    var lines = []
    if (failed.length) lines.push(failed.join(', ') + ' could not be loaded.')
    if (plan.dropped.length) {
      lines.push(
        plan.dropped.length +
          ' more ' +
          (plan.dropped.length === 1 ? 'currency' : 'currencies') +
          ' (' +
          plan.dropped.join(', ') +
          ') not shown — choose one in the currency filter.',
      )
    }
    if (plan.unknownLeftOut) {
      lines.push('Records without a currency code are not shown: the matrix is drawn per currency.')
    }
    return lines
  }

  /** Titled small multiples: several parts, or any fan-out (one per fetched currency). */
  function drawAsMultiples(parts, fanned) {
    return !!fanned || parts.length > 1
  }

  /**
   * The chart to draw: the widget's, unless its metric no longer offers it
   * (a stored legacy widget) — then the metric's default. A calendar needs day
   * buckets; anything else falls back to a line.
   */
  function effectiveChart(chart, result) {
    var charts = (result && result.metric && result.metric.charts) || []
    var c = charts.length === 0 || charts.indexOf(chart) !== -1 ? chart : charts[0]
    if (c === 'calendar' && result && result.granularity && result.granularity !== 'day') {
      c = 'line'
    }
    return c
  }

  /** The unit of a result's series values (not always its headline's). */
  function seriesUnit(result) {
    var m = result.metric || {}
    var kind = m.kind
    if (kind === 'duration' || kind === 'histogram') return 'count'
    if (kind === 'concentration') return m.money ? 'money' : 'quantity'
    if (kind === 'ratio') return 'percent'
    if (kind === 'dso' || kind === 'dpo' || kind === 'ccc') return 'days'
    if (m.money) return 'money'
    return m.unit || 'count'
  }

  /** The number a number tile or gauge shows: `{ value, unit, currency }`, or null. */
  function headline(result) {
    var m = result.metric || {}
    if (m.unit === 'money') {
      var totals = result.totals || []
      if (totals.length !== 1) return null
      return { value: totals[0].amount, unit: 'money', currency: totals[0].currency }
    }
    if (!num(result.value)) return null
    return { value: result.value, unit: m.unit || 'count', currency: null }
  }

  /** The prior period's headline, matched to the same currency. */
  function previousHeadline(result) {
    var prev = result.previous
    if (!prev) return null
    var m = result.metric || {}
    if (m.unit === 'money') {
      var totals = prev.totals || []
      var cur = headline(result)
      if (!cur) return null
      for (var i = 0; i < totals.length; i++) {
        if (sameCurrency(totals[i].currency, cur.currency)) return totals[i].amount
      }
      return 0
    }
    return num(prev.value) ? prev.value : null
  }

  /**
   * Change against the prior period. Percent metrics move in points, others
   * in percent of the prior value. `tone` is good / bad when thresholds say
   * which way is worse, else neutral.
   */
  function deltaOf(current, previous, unit, thresholds) {
    if (!num(current) || !num(previous)) return null
    var diff = current - previous
    var direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'
    var tone = 'neutral'
    if (thresholds && direction !== 'flat') {
      var worse = thresholds.direction === 'above' ? 'up' : 'down'
      tone = direction === worse ? 'bad' : 'good'
    }
    var pct = null
    if (unit !== 'percent' && previous !== 0) pct = (diff / Math.abs(previous)) * 100
    return { diff: diff, pct: pct, direction: direction, tone: tone }
  }

  /** `crit`, `warn` or `ok` for a value against thresholds; null without them. */
  function thresholdLevel(value, t) {
    if (!t || !num(value)) return null
    if (t.direction === 'above') return value >= t.crit ? 'crit' : value >= t.warn ? 'warn' : 'ok'
    return value <= t.crit ? 'crit' : value <= t.warn ? 'warn' : 'ok'
  }

  /**
   * Pareto rows: groups by value, largest first ("Other" last), each with its
   * share of the whole and the cumulative share. A concentration's table
   * already carries both (over its full ranking), so they are taken from it.
   */
  function paretoData(result) {
    var series = (result.series || [])[0]
    var points = series ? series.points : []
    var total = 0
    points.forEach(function (p) {
      if (num(p.y) && p.y > 0) total += p.y
    })
    var rows = (result.table && result.table.rows) || []
    var fromTable =
      rows.length > 0 &&
      has(rows[0], 'cumulative') &&
      has(rows[0], 'share') &&
      has(rows[0], 'label')
    var out = []
    if (fromTable) {
      rows.forEach(function (r) {
        if (!num(r.value)) return
        out.push({
          x: String(r.label),
          y: r.value,
          share: num(r.share) ? r.share : null,
          cumulative: num(r.cumulative) ? r.cumulative : null,
        })
      })
      var other = null
      points.forEach(function (p) {
        if (p.x === OTHER && num(p.y) && p.y > 0) other = p
      })
      if (other && total > 0) {
        out.push({ x: OTHER, y: other.y, share: (other.y / total) * 100, cumulative: 100 })
      }
      return out
    }
    var main = points.filter(function (p) {
      return p.x !== OTHER && num(p.y)
    })
    main.sort(function (a, b) {
      return b.y - a.y
    })
    var rest = points.filter(function (p) {
      return p.x === OTHER && num(p.y)
    })
    var run = 0
    main.concat(rest).forEach(function (p) {
      var positive = p.y > 0 ? p.y : 0
      run += positive
      out.push({
        x: p.x,
        y: p.y,
        share: total > 0 ? (positive / total) * 100 : null,
        cumulative: total > 0 ? (run / total) * 100 : null,
      })
    })
    return out
  }

  /**
   * Waterfall bars from a composition series: each component floats from the
   * running total before it to the one after; the final `Net` stands on zero.
   */
  function waterfallData(points) {
    var run = 0
    return points.map(function (p, i) {
      var y = num(p.y) ? p.y : 0
      if (i === points.length - 1 && p.x === NET) {
        return { x: p.x, low: Math.min(0, y), high: Math.max(0, y), value: y, kind: 'net' }
      }
      var start = run
      run += y
      return {
        x: p.x,
        low: Math.min(start, run),
        high: Math.max(start, run),
        value: y,
        kind: y >= 0 ? 'up' : 'down',
      }
    })
  }

  /** Day → value for a calendar: every series summed (counts), nulls skipped. */
  function calendarData(result) {
    var byDay = {}
    var order = []
    var series = result.series || []
    series.forEach(function (s) {
      s.points.forEach(function (p) {
        if (!num(p.y)) return
        if (!has(byDay, p.x)) {
          byDay[p.x] = 0
          order.push(p.x)
        }
        byDay[p.x] += p.y
      })
    })
    return order.map(function (x) {
      return [x, byDay[x]]
    })
  }

  /**
   * Series to draw, at most PALETTE_SIZE coloured. Counts are additive, so a
   * 7th series and beyond fold into "Other"; anything else (averages, money)
   * is kept, the extras drawn in the neutral grey.
   */
  function foldSeries(series, unit) {
    if (series.length <= PALETTE_SIZE || unit !== 'count') return series
    var kept = series.slice(0, PALETTE_SIZE - 1)
    var rest = series.slice(PALETTE_SIZE - 1)
    var points = rest[0].points.map(function (p, i) {
      var y = 0
      var any = false
      rest.forEach(function (s) {
        var q = s.points[i]
        if (q && num(q.y)) {
          y += q.y
          any = true
        }
      })
      return { x: p.x, y: any ? y : null }
    })
    return kept.concat([{ name: OTHER, points: points }])
  }

  /** The same-origin URL a widget's values come from. */
  function metricUrl(metricId, p) {
    var q = []
    function add(k, v) {
      if (v) q.push(k + '=' + encodeURIComponent(v))
    }
    add('from', p.from)
    add('to', p.to)
    add('dashboard', p.dashboard)
    if (p.currency && CURRENCY_RE.test(p.currency)) add('currency', p.currency)
    add('granularity', p.granularity === 'auto' ? '' : p.granularity)
    if (p.compare) add('compare', '1')
    if (p.connection && CONNECTION_RE.test(p.connection)) add('connection', p.connection)
    if (p.platform && PLATFORM_RE.test(p.platform)) add('platform', p.platform)
    if (p.vertical && VERTICAL_RE.test(p.vertical)) add('vertical', p.vertical)
    return (
      '/dashboards/metric/' + encodeURIComponent(metricId) + (q.length ? '?' + q.join('&') : '')
    )
  }

  // ── Formatting ─────────────────────────────────────────────────────────

  function fmtNumber(v, maxFrac, compact) {
    var opts = { maximumFractionDigits: maxFrac }
    if (compact) {
      opts.notation = 'compact'
      opts.maximumFractionDigits = 1
    }
    try {
      return new Intl.NumberFormat(undefined, opts).format(v)
    } catch (e) {
      return String(Math.round(v * 100) / 100)
    }
  }

  function fmtMoney(amount, currency, compact) {
    // Anything that is not an ISO code formats as a plain number: it must
    // never be appended to text a tooltip inserts as HTML.
    if (!currency || !CURRENCY_RE.test(currency)) return fmtNumber(amount, 2, compact)
    var opts = { style: 'currency', currency: currency }
    if (compact) {
      opts.notation = 'compact'
      opts.maximumFractionDigits = 1
    }
    try {
      return new Intl.NumberFormat(undefined, opts).format(amount)
    } catch (e) {
      return fmtNumber(amount, 2, compact) + ' ' + currency
    }
  }

  /** A value in its unit; `compact` for axes and tight labels. */
  function fmtValue(v, unit, currency, compact) {
    if (!num(v)) return '—'
    switch (unit) {
      case 'money':
        return fmtMoney(v, currency, compact)
      case 'percent':
        // A dispute rate of 0.95% must not read as 1%.
        return fmtNumber(v, Math.abs(v) < 10 ? 2 : 1, false) + '%'
      case 'days':
        return fmtNumber(v, 1, compact) + ' d'
      case 'hours':
        return fmtNumber(v, 1, compact) + ' h'
      case 'index':
      case 'quantity':
        return fmtNumber(v, 2, compact)
      default:
        return fmtNumber(v, 0, compact)
    }
  }

  /** "▲ 12.5% vs prior period" / "▼ 3.1 pts vs prior period". */
  function deltaText(d, unit, currency) {
    if (!d) return null
    if (d.direction === 'flat') return 'No change vs prior period'
    var arrow = d.direction === 'up' ? '▲ ' : '▼ '
    var size
    if (unit === 'percent') size = fmtNumber(Math.abs(d.diff), 1) + ' pts'
    else if (d.pct !== null) size = fmtNumber(Math.abs(d.pct), 1) + '%'
    else size = fmtValue(Math.abs(d.diff), unit, currency)
    return arrow + size + ' vs prior period'
  }

  /** Table cell text for a column key, by what that key means. */
  function fmtCell(v, key, result) {
    if (v === null || v === undefined) return '—'
    if (typeof v !== 'number') return String(v)
    var m = result.metric || {}
    var cur = result.currency || null
    if (key === 'share' || key === 'cumulative' || key === 'ratio') return fmtValue(v, 'percent')
    if (key === 'records' || key === 'n' || key === 'rank') return fmtValue(v, 'count')
    if (key === 'days') return fmtValue(v, 'days')
    if (/^(min|p25|p50|p75|p90|max|mean)$/.test(key)) return fmtValue(v, m.unit)
    var moneyKey = /^(amount|value|balance|sales|numerator|denominator)$/.test(key)
    if (m.money && moneyKey && m.kind !== 'histogram') return fmtValue(v, 'money', cur)
    if (key === 'value') return fmtValue(v, seriesUnit(result), cur)
    return fmtNumber(v, 2)
  }

  function emptyText(result) {
    if (result.currency && (result.currencies || []).indexOf(result.currency) === -1) {
      return 'No ' + result.currency + ' amounts in this period.'
    }
    return result.metric && result.metric.snapshot ? 'No data yet.' : 'No data in this period.'
  }

  function hasPoints(result) {
    return (result.series || []).some(function (s) {
      return s.points.some(function (p) {
        return num(p.y)
      })
    })
  }

  function thresholdsOf(result) {
    return result.thresholds || (result.metric && result.metric.thresholds) || null
  }

  function niceCeil(v) {
    var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10))
    var n = v / p
    var step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
    return step * p
  }

  // ── Option builders (one per chart type) ───────────────────────────────

  function baseOption(t) {
    return {
      backgroundColor: 'transparent',
      textStyle: { fontFamily: t.font, color: t.ink2 },
      color: t.palette,
      animation: false,
      grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
      tooltip: {
        backgroundColor: t.surface,
        borderColor: t.axis,
        textStyle: { color: t.ink, fontFamily: t.font },
        confine: true,
      },
    }
  }

  function legend(t, where) {
    var l = {
      type: 'scroll',
      textStyle: { color: t.ink2 },
      pageTextStyle: { color: t.muted },
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
    }
    if (where === 'bottom') {
      l.bottom = 0
      l.left = 'center'
    } else {
      l.top = 0
      l.left = 0
    }
    return l
  }

  function colorAt(t, i) {
    return i < t.palette.length ? t.palette[i] : t.other
  }

  function categoryAxis(t, data) {
    return {
      type: 'category',
      data: data,
      axisLine: { lineStyle: { color: t.axis } },
      axisTick: { show: false },
      axisLabel: { color: t.muted, hideOverlap: true },
    }
  }

  function valueAxis(t, unit, currency) {
    return {
      type: 'value',
      splitLine: { lineStyle: { color: t.grid } },
      axisLabel: {
        color: t.muted,
        formatter: function (v) {
          return fmtValue(v, unit, currency, true)
        },
      },
      minInterval: unit === 'count' ? 1 : 0,
    }
  }

  /** line, area, stacked_area, bar, hbar, stacked_bar, combo, histogram. */
  function cartesianOption(t, result, chart) {
    var unit = seriesUnit(result)
    var currency = result.currency || null
    var series = foldSeries(result.series || [], unit)
    if (series.length === 0 || !hasPoints(result)) return null
    var isStatus = result.metric.id === 'system.sync_outcomes_per_day'
    var xs = series[0].points.map(function (p) {
      return p.x
    })
    var horizontal = chart === 'hbar'
    var stacked = chart === 'stacked_bar' || chart === 'stacked_area'
    var opt = baseOption(t)
    opt.tooltip.trigger = 'axis'
    opt.tooltip.axisPointer = {
      type: chart === 'line' || chart === 'area' || chart === 'stacked_area' ? 'line' : 'shadow',
      lineStyle: { color: t.axis },
    }
    opt.tooltip.valueFormatter = function (v) {
      return fmtValue(v, unit, currency)
    }
    if (series.length > 1) opt.legend = legend(t)
    else opt.grid.top = 12
    var cat = categoryAxis(t, xs)
    var val = valueAxis(t, unit, currency)
    if (horizontal) {
      cat.inverse = true
      opt.yAxis = cat
      opt.xAxis = val
    } else {
      opt.xAxis = cat
      opt.yAxis = val
    }
    opt.series = series.map(function (s, i) {
      var color = isStatus && t.status[s.name] ? t.status[s.name] : colorAt(t, i)
      var type = 'bar'
      if (chart === 'line' || chart === 'area' || chart === 'stacked_area') type = 'line'
      if (chart === 'combo') type = s.kind || (i === 0 ? 'bar' : 'line')
      var out = {
        name: s.name,
        type: type,
        data: s.points.map(function (p) {
          return num(p.y) ? p.y : null
        }),
        itemStyle: { color: color },
      }
      if (type === 'line') {
        out.showSymbol = s.points.length <= 2
        out.symbolSize = 8
        out.connectNulls = false
        out.lineStyle = { width: 2, color: color }
        if (chart === 'area') out.areaStyle = { color: color, opacity: 0.12 }
        if (chart === 'stacked_area') {
          out.stack = 'total'
          out.lineStyle = { width: 1, color: t.surface }
          out.areaStyle = { color: color, opacity: 0.9 }
        }
        return out
      }
      out.barMaxWidth = chart === 'histogram' ? undefined : 28
      if (chart === 'histogram') out.barCategoryGap = '4%'
      if (stacked || (isStatus && chart === 'bar' && series.length > 1)) {
        out.stack = 'total'
        out.itemStyle = { color: color, borderColor: t.surface, borderWidth: 1 }
      } else {
        out.itemStyle = {
          color: color,
          borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0],
        }
      }
      return out
    })
    return opt
  }

  /** Top slices coloured in fixed order; the rest fold into a grey "Other". */
  function sliceData(t, points) {
    var positive = points.filter(function (p) {
      return num(p.y) && p.y > 0
    })
    var other = 0
    var main = []
    positive.forEach(function (p) {
      if (p.x === OTHER) other += p.y
      else main.push(p)
    })
    if (main.length > PALETTE_SIZE) {
      main.slice(PALETTE_SIZE - 1).forEach(function (p) {
        other += p.y
      })
      main = main.slice(0, PALETTE_SIZE - 1)
    }
    var data = main.map(function (p, i) {
      return { name: p.x, value: p.y, itemStyle: { color: t.palette[i] } }
    })
    if (other > 0) data.push({ name: OTHER, value: other, itemStyle: { color: t.other } })
    return data
  }

  /** pie, donut, rose. */
  function pieOption(t, result, chart) {
    var unit = seriesUnit(result)
    var currency = result.currency || null
    var data = sliceData(t, ((result.series || [])[0] || { points: [] }).points)
    if (data.length === 0) return null
    var opt = baseOption(t)
    opt.tooltip.trigger = 'item'
    opt.tooltip.formatter = function (p) {
      return (
        esc(p.name) +
        ': ' +
        esc(fmtValue(p.value, unit, currency)) +
        ' (' +
        esc(fmtNumber(p.percent, 1)) +
        '%)'
      )
    }
    opt.legend = legend(t, 'bottom')
    var s = {
      type: 'pie',
      center: ['50%', '45%'],
      data: data,
      label: {
        color: t.ink2,
        formatter: function (p) {
          return plain(p.name) + ' ' + fmtNumber(p.percent, 0) + '%'
        },
      },
      labelLine: { lineStyle: { color: t.axis } },
      itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 4 },
    }
    if (chart === 'donut') s.radius = ['45%', '70%']
    else if (chart === 'rose') {
      s.radius = ['15%', '70%']
      s.roseType = 'area'
    } else s.radius = [0, '70%']
    opt.series = [s]
    return opt
  }

  /** Areas by value, one hue (the groups are nominal), "Other" in grey. */
  function treemapOption(t, result) {
    var unit = seriesUnit(result)
    var currency = result.currency || null
    var points = ((result.series || [])[0] || { points: [] }).points.filter(function (p) {
      return num(p.y) && p.y > 0
    })
    if (points.length === 0) return null
    var opt = baseOption(t)
    opt.tooltip.trigger = 'item'
    opt.tooltip.formatter = function (p) {
      return esc(p.name) + ': ' + esc(fmtValue(p.value, unit, currency))
    }
    opt.series = [
      {
        type: 'treemap',
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        width: '100%',
        height: '100%',
        top: 0,
        left: 0,
        itemStyle: { borderColor: t.surface, borderWidth: 2, gapWidth: 2, borderRadius: 4 },
        label: {
          color: t.surface,
          formatter: function (p) {
            return plain(p.name) + '\n' + fmtValue(p.value, unit, currency, true)
          },
        },
        data: points.map(function (p) {
          var other = p.x === OTHER
          return {
            name: p.x,
            value: p.y,
            itemStyle: { color: other ? t.other : t.palette[0] },
            // The grey is too light for surface-coloured text.
            label: other ? { color: t.ink } : undefined,
          }
        }),
      },
    ]
    return opt
  }

  /** Stages in their own order, the ordinal ramp from dark (first) to light. */
  function funnelOption(t, result) {
    var unit = seriesUnit(result)
    var currency = result.currency || null
    var points = ((result.series || [])[0] || { points: [] }).points.filter(function (p) {
      return num(p.y)
    })
    if (points.length === 0 || !hasPoints(result)) return null
    var max = 0
    points.forEach(function (p) {
      if (p.y > max) max = p.y
    })
    var n = points.length
    var opt = baseOption(t)
    opt.tooltip.trigger = 'item'
    opt.tooltip.formatter = function (p) {
      return esc(p.name) + ': ' + esc(fmtValue(p.value, unit, currency))
    }
    opt.series = [
      {
        type: 'funnel',
        sort: 'none',
        min: 0,
        max: max || 1,
        left: '4%',
        width: '58%',
        top: 8,
        bottom: 8,
        gap: 2,
        // Beside the stage, in ink: the ramp's light end cannot carry text.
        label: {
          position: 'right',
          color: t.ink2,
          formatter: function (p) {
            return plain(p.name) + ': ' + fmtValue(p.value, unit, currency, true)
          },
        },
        labelLine: { lineStyle: { color: t.axis } },
        itemStyle: { borderColor: t.surface, borderWidth: 0 },
        data: points.map(function (p, i) {
          var step = n === 1 ? 4 : 4 - Math.round((i * 4) / (n - 1))
          return { name: p.x, value: p.y, itemStyle: { color: t.seq[step] } }
        }),
      },
    ]
    return opt
  }

  /** One polygon over the groups, every axis on the same scale. */
  function radarOption(t, result) {
    var unit = seriesUnit(result)
    var currency = result.currency || null
    var series = (result.series || []).slice(0, PALETTE_SIZE)
    if (series.length === 0 || !hasPoints(result)) return null
    var names = series[0].points.map(function (p) {
      return p.x
    })
    var max = 0
    series.forEach(function (s) {
      s.points.forEach(function (p) {
        if (num(p.y) && p.y > max) max = p.y
      })
    })
    var opt = baseOption(t)
    opt.tooltip.trigger = 'item'
    opt.tooltip.valueFormatter = function (v) {
      return fmtValue(v, unit, currency)
    }
    if (series.length > 1) opt.legend = legend(t, 'bottom')
    opt.radar = {
      radius: '65%',
      center: ['50%', '52%'],
      indicator: names.map(function (n) {
        return { name: n, max: max * 1.1 || 1 }
      }),
      axisName: { color: t.muted },
      splitLine: { lineStyle: { color: t.grid } },
      splitArea: { show: false },
      axisLine: { lineStyle: { color: t.grid } },
    }
    opt.series = [
      {
        type: 'radar',
        data: series.map(function (s, i) {
          return {
            name: s.name,
            value: s.points.map(function (p) {
              return num(p.y) ? p.y : 0
            }),
            lineStyle: { width: 2, color: colorAt(t, i) },
            itemStyle: { color: colorAt(t, i) },
            areaStyle: { color: colorAt(t, i), opacity: 0.12 },
            symbolSize: 6,
          }
        }),
      },
    ]
    return opt
  }

  /** Each group's share as a bar and the cumulative share as a line, one 0–100 % axis. */
  function paretoOption(t, result) {
    var unit = seriesUnit(result)
    var currency = result.currency || null
    var rows = paretoData(result).filter(function (r) {
      return r.share !== null
    })
    if (rows.length === 0) return null
    var opt = baseOption(t)
    opt.legend = legend(t)
    opt.tooltip.trigger = 'axis'
    opt.tooltip.axisPointer = { type: 'shadow' }
    opt.tooltip.formatter = function (ps) {
      var r = rows[ps[0].dataIndex]
      return (
        esc(r.x) +
        '<br>' +
        esc(fmtValue(r.y, unit, currency)) +
        ' · ' +
        esc(fmtValue(r.share, 'percent')) +
        '<br>Cumulative ' +
        esc(fmtValue(r.cumulative, 'percent'))
      )
    }
    opt.xAxis = categoryAxis(
      t,
      rows.map(function (r) {
        return r.x
      }),
    )
    opt.yAxis = valueAxis(t, 'percent')
    opt.yAxis.max = 100
    opt.series = [
      {
        name: 'Share',
        type: 'bar',
        barMaxWidth: 28,
        data: rows.map(function (r) {
          return {
            value: r.share,
            itemStyle: {
              color: r.x === OTHER ? t.other : t.palette[0],
              borderRadius: [4, 4, 0, 0],
            },
          }
        }),
      },
      {
        name: 'Cumulative',
        type: 'line',
        data: rows.map(function (r) {
          return r.cumulative
        }),
        showSymbol: rows.length <= 12,
        symbolSize: 8,
        lineStyle: { width: 2, color: t.palette[1] },
        itemStyle: { color: t.palette[1] },
      },
    ]
    return opt
  }

  /** Stats per group: `All` first (neutral ink), then each group. */
  function boxplotOption(t, result) {
    var stats = result.stats || []
    if (stats.length === 0) return null
    var unit = (result.metric && result.metric.unit) || 'days'
    var opt = baseOption(t)
    opt.grid.top = 12
    opt.tooltip.trigger = 'item'
    opt.tooltip.formatter = function (p) {
      var s = stats[p.dataIndex]
      return (
        esc(s.group) +
        ' (' +
        esc(fmtValue(s.n, 'count')) +
        ')<br>Median ' +
        esc(fmtValue(s.p50, unit)) +
        ' · p25–p75 ' +
        esc(fmtValue(s.p25, unit)) +
        '–' +
        esc(fmtValue(s.p75, unit)) +
        '<br>p90 ' +
        esc(fmtValue(s.p90, unit)) +
        ' · mean ' +
        esc(fmtValue(s.mean, unit)) +
        '<br>min ' +
        esc(fmtValue(s.min, unit)) +
        ' · max ' +
        esc(fmtValue(s.max, unit))
      )
    }
    opt.xAxis = categoryAxis(
      t,
      stats.map(function (s) {
        return s.group
      }),
    )
    opt.yAxis = valueAxis(t, unit)
    opt.series = [
      {
        type: 'boxplot',
        boxWidth: [8, 36],
        data: stats.map(function (s, i) {
          var stroke = i === 0 && s.group === 'All' ? t.ink2 : t.palette[0]
          return {
            value: [s.min, s.p25, s.p50, s.p75, s.max],
            itemStyle: { color: t.surface1, borderColor: stroke, borderWidth: 1.5 },
          }
        }),
      },
    ]
    return opt
  }

  /** Signed components floating from the running total; `Net` from zero. */
  function waterfallOption(t, result) {
    var unit = seriesUnit(result)
    var currency = result.currency || null
    var series = (result.series || [])[0]
    if (!series || series.points.length === 0) return null
    var items = waterfallData(series.points)
    var colors = { up: t.palette[0], down: t.palette[5], net: t.ink2 }
    var opt = baseOption(t)
    opt.grid.top = 12
    opt.tooltip.trigger = 'item'
    opt.tooltip.formatter = function (p) {
      var it = items[p.dataIndex]
      return esc(it.x) + ': ' + esc(fmtValue(it.value, unit, currency))
    }
    opt.xAxis = categoryAxis(
      t,
      items.map(function (it) {
        return it.x
      }),
    )
    opt.yAxis = valueAxis(t, unit, currency)
    opt.series = [
      {
        type: 'custom',
        encode: { x: 0, y: [1, 2] },
        data: items.map(function (it, i) {
          return [i, it.low, it.high, it.value]
        }),
        renderItem: function (params, api) {
          var idx = api.value(0)
          var top = api.coord([idx, api.value(2)])
          var bottom = api.coord([idx, api.value(1)])
          var width = Math.min(api.size([1, 0])[0] * 0.6, 48)
          var it = items[params.dataIndex]
          return {
            type: 'rect',
            shape: {
              x: top[0] - width / 2,
              y: top[1],
              width: width,
              height: Math.max(1, bottom[1] - top[1]),
              r: 3,
            },
            style: { fill: colors[it.kind] },
          }
        },
      },
    ]
    return opt
  }

  function visualMap(t, max, unit, currency) {
    return {
      min: 0,
      max: max > 0 ? max : 1,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemWidth: 10,
      itemHeight: 90,
      inRange: { color: t.seq },
      text: [fmtValue(max, unit, currency, true), fmtValue(0, unit, currency, true)],
      textGap: 6,
      textStyle: { color: t.muted },
      formatter: function (v) {
        return fmtValue(v, unit, currency, true)
      },
    }
  }

  /** A matrix result, cells on the sequential ramp. */
  function heatmapOption(t, result) {
    var m = result.matrix
    if (!m || m.cells.length === 0) return null
    var unit = seriesUnit(result)
    var currency = result.currency || null
    var max = 0
    m.cells.forEach(function (c) {
      if (c[2] > max) max = c[2]
    })
    var opt = baseOption(t)
    opt.grid = { left: 8, right: 16, top: 8, bottom: 40, containLabel: true }
    opt.tooltip.trigger = 'item'
    opt.tooltip.formatter = function (p) {
      return (
        esc(m.x[p.value[0]]) +
        ' · ' +
        esc(m.y[p.value[1]]) +
        ': ' +
        esc(fmtValue(p.value[2], unit, currency))
      )
    }
    opt.xAxis = categoryAxis(t, m.x)
    opt.xAxis.splitArea = { show: false }
    opt.yAxis = categoryAxis(t, m.y)
    opt.yAxis.inverse = true
    opt.visualMap = visualMap(t, max, unit, currency)
    opt.series = [
      {
        type: 'heatmap',
        data: m.cells,
        itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 2 },
        emphasis: { itemStyle: { borderColor: t.ink, borderWidth: 1 } },
      },
    ]
    return opt
  }

  /** A day series as a calendar heatmap over the widget's range. */
  function calendarOption(t, result) {
    var data = calendarData(result)
    if (data.length === 0) return null
    var unit = seriesUnit(result)
    var max = 0
    data.forEach(function (d) {
      if (d[1] > max) max = d[1]
    })
    var opt = baseOption(t)
    opt.tooltip.trigger = 'item'
    opt.tooltip.formatter = function (p) {
      return esc(p.value[0]) + ': ' + esc(fmtValue(p.value[1], unit, null))
    }
    opt.visualMap = visualMap(t, max, unit, null)
    opt.calendar = {
      range: [result.range.from, result.range.to],
      orient: 'horizontal',
      left: 36,
      right: 12,
      top: 24,
      bottom: 40,
      cellSize: ['auto', 'auto'],
      splitLine: { show: false },
      itemStyle: { color: t.surface1, borderColor: t.surface, borderWidth: 2 },
      dayLabel: { color: t.muted, firstDay: 1, nameMap: ['S', 'M', 'T', 'W', 'T', 'F', 'S'] },
      monthLabel: { color: t.muted },
      yearLabel: { show: false },
    }
    opt.series = [{ type: 'heatmap', coordinateSystem: 'calendar', data: data }]
    return opt
  }

  function chartOption(t, result, chart) {
    switch (chart) {
      case 'pie':
      case 'donut':
      case 'rose':
        return pieOption(t, result, chart)
      case 'treemap':
        return treemapOption(t, result)
      case 'funnel':
        return funnelOption(t, result)
      case 'radar':
        return radarOption(t, result)
      case 'pareto':
        return paretoOption(t, result)
      case 'boxplot':
        return boxplotOption(t, result)
      case 'waterfall':
        return waterfallOption(t, result)
      case 'heatmap':
        return heatmapOption(t, result)
      case 'calendar':
        return calendarOption(t, result)
      default:
        return cartesianOption(t, result, chart)
    }
  }

  /** A dial for a headline: threshold bands when the metric has levels, else a progress arc. */
  function gaugeOption(t, result, h, compact) {
    var th = thresholdsOf(result)
    // The dial spans what the thresholds need: 0–100 for a percent, unless its
    // levels sit far below that (a 1% dispute-rate limit on a 0–100 dial
    // would put every value against the stop).
    var top
    if (h.unit === 'percent') {
      top = th ? Math.min(100, niceCeil(Math.max(h.value, th.warn, th.crit) * 1.5)) : 100
      top = Math.max(top, h.value)
    } else {
      top = Math.max(h.value, th ? Math.max(th.warn, th.crit) * 1.25 : 0, 0)
      top = top > 0 ? niceCeil(top * 1.1) : 1
    }
    var bottom = Math.min(0, h.value)
    var span = top - bottom || 1
    function at(v) {
      return Math.max(0, Math.min(1, (v - bottom) / span))
    }
    var bands = [[1, t.grid]]
    if (th) {
      bands =
        th.direction === 'above'
          ? [
              [at(th.warn), t.good],
              [at(th.crit), t.warn],
              [1, t.bad],
            ]
          : [
              [at(th.crit), t.bad],
              [at(th.warn), t.warn],
              [1, t.good],
            ]
    }
    var opt = baseOption(t)
    delete opt.tooltip
    opt.series = [
      {
        type: 'gauge',
        min: bottom,
        max: top,
        startAngle: 200,
        endAngle: -20,
        radius: '95%',
        center: ['50%', '70%'],
        progress: { show: !th, width: 10, itemStyle: { color: t.palette[0] } },
        axisLine: { lineStyle: { width: 10, color: th ? bands : [[1, t.grid]] } },
        pointer: { show: !!th, length: '58%', width: 4, itemStyle: { color: t.ink2 } },
        anchor: { show: !!th, size: 8, itemStyle: { color: t.ink2 } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        title: { show: false },
        detail: {
          valueAnimation: false,
          offsetCenter: [0, '18%'],
          color: t.ink,
          fontSize: compact ? 18 : 24,
          fontWeight: 600,
          formatter: function (v) {
            return fmtValue(v, h.unit, h.currency)
          },
        },
        data: [{ value: h.value }],
      },
    ]
    return opt
  }

  var helpers = {
    currenciesOf: currenciesOf,
    splitByCurrency: splitByCurrency,
    sliceResult: sliceResult,
    needsCurrencyFanOut: needsCurrencyFanOut,
    fanOutPlan: fanOutPlan,
    fanOutNotes: fanOutNotes,
    drawAsMultiples: drawAsMultiples,
    effectiveChart: effectiveChart,
    seriesUnit: seriesUnit,
    headline: headline,
    previousHeadline: previousHeadline,
    deltaOf: deltaOf,
    deltaText: deltaText,
    thresholdLevel: thresholdLevel,
    paretoData: paretoData,
    waterfallData: waterfallData,
    calendarData: calendarData,
    foldSeries: foldSeries,
    metricUrl: metricUrl,
    fmtValue: fmtValue,
    fmtCell: fmtCell,
    esc: esc,
    /**
     * The option builders, pure given the colour tokens `t`: each returns the
     * ECharts option for one chart type, or null when there is nothing to draw.
     * Exposed so tests can call every formatter they install.
     */
    options: {
      chart: chartOption,
      cartesian: cartesianOption,
      pie: pieOption,
      treemap: treemapOption,
      funnel: funnelOption,
      radar: radarOption,
      pareto: paretoOption,
      boxplot: boxplotOption,
      waterfall: waterfallOption,
      heatmap: heatmapOption,
      calendar: calendarOption,
      gauge: gaugeOption,
    },
  }
  global.__dashboardCharts = helpers

  if (typeof document === 'undefined') return

  // ── Page wiring that needs no widgets: the filter's currency select ────

  var selects = document.querySelectorAll('[data-autosubmit]')
  for (var si = 0; si < selects.length; si++) {
    selects[si].addEventListener('change', function (ev) {
      var form = ev.target.form
      if (!form) return
      if (typeof form.requestSubmit === 'function') form.requestSubmit()
      else form.submit()
    })
  }

  // ── The connection filter's datalist, refreshed as you type ────────────
  // Only when the page could not list every connection (`data-more`): the
  // browser filters the listed ones itself, with or without this script.

  var connInput = document.querySelector('[data-connection-input][data-more]')
  if (connInput) wireConnectionSearch(connInput)

  function wireConnectionSearch(input) {
    var list = document.getElementById(input.getAttribute('list') || '')
    var url = input.getAttribute('data-connections-url')
    var select = input.form ? input.form.querySelector('select[name="platform"]') : null
    if (!list || !url) return
    var timer = null
    var seq = 0
    input.addEventListener('input', function () {
      clearTimeout(timer)
      var text = input.value.trim()
      if (text.length < 2) return
      timer = setTimeout(function () {
        var mine = ++seq
        var q = url + (url.indexOf('?') < 0 ? '?' : '&') + 'search=' + encodeURIComponent(text)
        if (select && PLATFORM_RE.test(select.value)) q += '&platform=' + select.value
        fetchMetric(q)
          .then(function (r) {
            var options = r.ok && r.json && r.json.data && r.json.data.options
            if (mine !== seq || !options) return
            while (list.firstChild) list.removeChild(list.firstChild)
            options.forEach(function (o) {
              var opt = document.createElement('option')
              opt.value = String(o.value)
              opt.textContent = String(o.text)
              list.appendChild(opt)
            })
          })
          .catch(function () {})
      }, 250)
    })
  }

  var root = document.querySelector('[data-dashboard]')
  if (!root) return
  var from = root.getAttribute('data-from') || ''
  var to = root.getAttribute('data-to') || ''
  var dashboardId = root.getAttribute('data-dashboard-id') || ''
  var rendered = []
  var observer = null

  // ── Tokens ─────────────────────────────────────────────────────────────

  var probe = null
  /** Any CSS colour (oklch included) → `rgb(r, g, b)` ECharts can parse. */
  function toRgb(color, fallback) {
    if (!color) return fallback
    try {
      if (!probe) {
        probe = document.createElement('canvas')
        probe.width = probe.height = 1
      }
      var ctx = probe.getContext('2d', { willReadFrequently: true })
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = '#000'
      ctx.fillStyle = color
      ctx.fillRect(0, 0, 1, 1)
      var d = ctx.getImageData(0, 0, 1, 1).data
      return 'rgb(' + d[0] + ', ' + d[1] + ', ' + d[2] + ')'
    } catch (e) {
      return fallback
    }
  }

  function tokens() {
    var cs = getComputedStyle(document.documentElement)
    function v(name, fallback) {
      return toRgb(cs.getPropertyValue(name).trim(), fallback)
    }
    var palette = []
    for (var i = 1; i <= PALETTE_SIZE; i++) palette.push(v('--chart-' + i, '#2F6AA8'))
    var seqFallback = ['#8db3dc', '#6a98cc', '#4a7db9', '#2f63a0', '#1c477a']
    var seq = []
    for (var j = 1; j <= 5; j++) seq.push(v('--chart-seq-' + j, seqFallback[j - 1]))
    return {
      palette: palette,
      seq: seq,
      other: v('--fg-4', '#A5A599'),
      ink: v('--fg-1', '#17180F'),
      ink2: v('--fg-2', '#46483A'),
      muted: v('--fg-3', '#73746A'),
      grid: v('--border-subtle', '#EBE8E1'),
      axis: v('--border-default', '#DAD6CB'),
      surface: v('--surface-0', '#FFFFFF'),
      surface1: v('--surface-1', '#F6F4EF'),
      good: v('--success', '#3D7A47'),
      warn: v('--warning', '#B5751E'),
      bad: v('--danger', '#B33A2A'),
      status: {
        completed: v('--success', '#3D7A47'),
        failed: v('--danger', '#B33A2A'),
        running: v('--info', '#2F6AA8'),
        pending: v('--warning', '#B5751E'),
        cancelled: v('--fg-4', '#A5A599'),
      },
      font: cs.getPropertyValue('--font-sans').trim() || 'sans-serif',
    }
  }

  // ── DOM helpers ────────────────────────────────────────────────────────

  function el(tag, cls, text) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    if (text !== undefined && text !== null) n.textContent = text
    return n
  }

  function setState(body, text) {
    body.textContent = ''
    body.appendChild(el('p', 'dash-widget__state', text))
  }

  // ── Renderers ──────────────────────────────────────────────────────────

  function observe(holder, instance) {
    rendered.push(instance)
    if (typeof ResizeObserver === 'undefined') return
    if (!observer) {
      observer = new ResizeObserver(function (entries) {
        entries.forEach(function (entry) {
          var chart = window.echarts.getInstanceByDom(entry.target)
          if (chart) chart.resize()
        })
      })
    }
    observer.observe(holder)
  }

  function renderChart(body, result, chart) {
    if (typeof window.echarts === 'undefined') return renderTable(body, result)
    if (chart === 'heatmap' && !result.matrix) {
      return setState(body, result.note || emptyText(result))
    }
    var option = chartOption(tokens(), result, chart)
    if (!option) return setState(body, emptyText(result))
    body.textContent = ''
    var holder = el('div', 'dash-widget__chart')
    holder.setAttribute('role', 'img')
    holder.setAttribute(
      'aria-label',
      ((result.metric && result.metric.title) || 'Chart') +
        (result.currency ? ' (' + result.currency + ')' : ''),
    )
    body.appendChild(holder)
    var instance = window.echarts.init(holder, null, { renderer: 'svg' })
    instance.setOption(option)
    observe(holder, instance)
  }

  function renderTable(body, result) {
    body.textContent = ''
    var columns
    var rows
    if (result.table) {
      columns = result.table.columns
      rows = result.table.rows
    } else {
      var series = result.series || []
      var unit = seriesUnit(result)
      columns = [{ key: '__x', label: result.granularity ? 'Period' : 'Group' }].concat(
        series.map(function (s, i) {
          return { key: 's' + i, label: s.name }
        }),
      )
      var byX = {}
      var order = []
      series.forEach(function (s, i) {
        s.points.forEach(function (p) {
          if (!has(byX, p.x)) {
            byX[p.x] = { __x: p.x }
            order.push(p.x)
          }
          byX[p.x]['s' + i] = fmtValue(p.y, unit, result.currency || s.currency || null)
        })
      })
      rows = order.map(function (x) {
        return byX[x]
      })
    }
    if (!rows || rows.length === 0) return setState(body, emptyText(result))
    var wrap = el('div', 'table-scroll dash-widget__table')
    var table = el('table', 'table')
    var thead = el('thead')
    var hr = el('tr')
    columns.forEach(function (c) {
      var th = el('th', null, c.label)
      th.scope = 'col'
      hr.appendChild(th)
    })
    thead.appendChild(hr)
    var tbody = el('tbody')
    rows.forEach(function (r) {
      var tr = el('tr')
      columns.forEach(function (c) {
        var v = r[c.key]
        var td = el('td', typeof v === 'number' ? 'dash-num' : null, fmtCell(v, c.key, result))
        tr.appendChild(td)
      })
      tbody.appendChild(tr)
    })
    table.appendChild(thead)
    table.appendChild(tbody)
    wrap.appendChild(table)
    body.appendChild(wrap)
  }

  var LEVEL = {
    ok: { cls: 'badge--success', text: 'Within target' },
    warn: { cls: 'badge--warning', text: 'Warning' },
    crit: { cls: 'badge--danger', text: 'Critical' },
  }

  /** Status pill, change against the prior period, and a secondary line. */
  function kpiCaption(container, result, h, compact) {
    var level = thresholdLevel(h.value, thresholdsOf(result))
    if (level) {
      var badge = el('span', 'badge ' + LEVEL[level].cls + ' dash-kpi__status')
      badge.appendChild(el('span', 'badge__dot'))
      badge.appendChild(document.createTextNode(LEVEL[level].text))
      container.appendChild(badge)
    }
    var prev = previousHeadline(result)
    var d = deltaOf(h.value, prev, h.unit, thresholdsOf(result))
    var text = deltaText(d, h.unit, h.currency)
    if (text) {
      var delta = el('div', 'dash-kpi__delta dash-kpi__delta--' + d.tone, text)
      delta.title = 'Prior period ' + result.previous.range.from + ' – ' + result.previous.range.to
      delta.title += ': ' + fmtValue(prev, h.unit, h.currency)
      container.appendChild(delta)
    }
    var extras = (result.kpis || [])
      .filter(function (k) {
        return num(k.value) && !(k.unit === h.unit && k.value === h.value) && k.key !== 'ratio'
      })
      .slice(0, compact ? 2 : 3)
      .map(function (k) {
        return (
          k.label +
          ' ' +
          fmtValue(k.value, k.unit, k.unit === 'money' ? h.currency || k.currency : null)
        )
      })
    if (extras.length)
      container.appendChild(el('div', 'dash-widget__number-sub', extras.join(' · ')))
    if (!compact) {
      var r = result.range
      var when =
        result.metric && result.metric.snapshot
          ? 'As of ' + r.to
          : r.from === r.to
            ? r.from
            : r.from + ' – ' + r.to
      container.appendChild(el('div', 'dash-widget__number-sub', when))
    }
  }

  function renderNumber(body, result, compact) {
    var h = headline(result)
    body.textContent = ''
    if (!h) return setState(body, emptyText(result))
    var tile = el('div', 'dash-kpi')
    tile.appendChild(el('div', 'dash-widget__number', fmtValue(h.value, h.unit, h.currency)))
    kpiCaption(tile, result, h, compact)
    body.appendChild(tile)
  }

  function renderGauge(body, result, compact) {
    var h = headline(result)
    if (!h) return setState(body, emptyText(result))
    if (typeof window.echarts === 'undefined') return renderNumber(body, result, compact)
    var opt = gaugeOption(tokens(), result, h, compact)
    body.textContent = ''
    var wrap = el('div', 'dash-gauge')
    var holder = el('div', 'dash-gauge__chart')
    holder.setAttribute('role', 'img')
    holder.setAttribute(
      'aria-label',
      ((result.metric && result.metric.title) || 'Gauge') +
        ': ' +
        fmtValue(h.value, h.unit, h.currency),
    )
    wrap.appendChild(holder)
    var caption = el('div', 'dash-gauge__caption')
    wrap.appendChild(caption)
    body.appendChild(wrap)
    var instance = window.echarts.init(holder, null, { renderer: 'svg' })
    instance.setOption(opt)
    observe(holder, instance)
    kpiCaption(caption, result, h, true)
  }

  function drawPart(container, result, chart, compact) {
    if (chart === 'number') return renderNumber(container, result, compact)
    if (chart === 'gauge') return renderGauge(container, result, compact)
    if (chart === 'table') return renderTable(container, result)
    return renderChart(container, result, chart)
  }

  /** How a small multiple lays out: tiles, stacked tables, or a grid of charts. */
  function multipleLayout(chart) {
    if (chart === 'number') return 'tiles'
    if (chart === 'table') return 'stack'
    return 'grid'
  }

  /** "▲ 4% vs prior period" for a part whose chart shows no headline itself. */
  function partDelta(result) {
    var h = headline(result)
    if (!h) return null
    return deltaText(
      deltaOf(h.value, previousHeadline(result), h.unit, thresholdsOf(result)),
      h.unit,
      h.currency,
    )
  }

  function footnote(widget, lines) {
    var old = widget.querySelector('[data-widget-foot]')
    if (old) old.parentNode.removeChild(old)
    var kept = lines.filter(Boolean)
    if (kept.length === 0) return
    var p = el('p', 'dash-widget__foot', kept.join(' '))
    p.setAttribute('data-widget-foot', '')
    widget.appendChild(p)
  }

  function coverageText(result) {
    var c = result.coverage
    if (!c || !num(c.total) || c.total <= 0) return null
    var pct = Math.round((c.eligible / c.total) * 100)
    return (
      'Based on ' +
      fmtValue(c.eligible, 'count') +
      ' of ' +
      fmtValue(c.total, 'count') +
      ' records (' +
      pct +
      '%).'
    )
  }

  /** Replace the body's sizing modifiers: `multi` (small multiples), `fit` (a table), `tall`. */
  function sizeBody(body, mods) {
    body.className = body.className.replace(/\s*dash-widget__body--(multi|fit|tall)\b/g, '')
    mods.forEach(function (m) {
      body.className += ' dash-widget__body--' + m
    })
  }

  /** Draw a result; `fan` is a per-currency fan-out: `{ parts, notes }`. */
  function render(widget, result, fan) {
    var body = widget.querySelector('[data-widget-body]')
    var chart = effectiveChart(widget.getAttribute('data-chart') || 'bar', result)
    var tall = chart === 'heatmap' && result.matrix && result.matrix.y.length > 8
    sizeBody(body, chart === 'table' ? ['fit'] : tall ? ['tall'] : [])
    if (result.masked) {
      setState(body, 'Withheld: financial values are masked on this deployment.')
      return footnote(widget, [result.note])
    }
    var parts = fan ? fan.parts : splitByCurrency(result)
    var hidden = []
    if (parts.length > MAX_MULTIPLES) {
      hidden = parts.slice(MAX_MULTIPLES)
      parts = parts.slice(0, MAX_MULTIPLES)
    }
    var lines = [coverageText(result)]
    if (!drawAsMultiples(parts, !!fan)) {
      drawPart(body, parts[0].result, chart, false)
      if (chart !== 'number' && chart !== 'gauge') lines.push(partDelta(parts[0].result))
    } else {
      body.textContent = ''
      sizeBody(body, ['multi'])
      var grid = el('div', 'dash-multiples dash-multiples--' + multipleLayout(chart))
      // Attached before anything is drawn: ECharts measures its container on
      // init, and forces `position: relative` onto one it finds detached.
      body.appendChild(grid)
      parts.forEach(function (part) {
        var cell = el('div', 'dash-multiple')
        var title = el('div', 'dash-multiple__title', part.label)
        if (chart !== 'number' && chart !== 'gauge') {
          var d = partDelta(part.result)
          if (d) title.appendChild(el('span', 'dash-multiple__delta', d))
        }
        cell.appendChild(title)
        var inner = el('div', 'dash-multiple__body dash-multiple__body--' + chart)
        cell.appendChild(inner)
        grid.appendChild(cell)
        drawPart(inner, part.result, chart, true)
      })
    }
    if (hidden.length) {
      lines.push(
        hidden.length +
          ' more ' +
          (hidden.length === 1 ? 'currency' : 'currencies') +
          ' (' +
          hidden
            .map(function (p) {
              return p.label
            })
            .join(', ') +
          ') not shown — choose one in the currency filter.',
      )
    }
    if (fan) lines.push.apply(lines, fan.notes)
    lines.push(fan && fan.parts.length ? fan.parts[0].result.note : result.note)
    footnote(widget, lines)
  }

  // ── Loading ────────────────────────────────────────────────────────────

  var results = []

  function fetchMetric(url) {
    return fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' }).then(
      function (res) {
        return res.json().then(
          function (json) {
            return { ok: res.ok, status: res.status, json: json }
          },
          function () {
            return { ok: false, status: res.status, json: null }
          },
        )
      },
    )
  }

  function failure(body, r) {
    var code = r.json && r.json.error && r.json.error.code
    if (r.status === 404) return setState(body, 'This metric is not available to you.')
    if (code === 'DATA_STORE_DISABLED') {
      return setState(body, 'Nothing is stored on this deployment (passthrough mode).')
    }
    var msg = r.json && r.json.error && r.json.error.message
    return setState(body, msg || 'This chart could not be loaded.')
  }

  function load(widget) {
    var body = widget.querySelector('[data-widget-body]')
    if (body.querySelector('[data-unavailable]')) return
    var id = widget.getAttribute('data-metric-id')
    var chart = widget.getAttribute('data-chart') || 'bar'
    var params = {
      from: from,
      to: to,
      dashboard: dashboardId,
      currency: widget.getAttribute('data-currency') || '',
      // A calendar is a day grid, whatever the widget's buckets.
      granularity: chart === 'calendar' ? 'day' : widget.getAttribute('data-granularity') || '',
      compare: widget.getAttribute('data-compare') === '1',
      connection: widget.getAttribute('data-connection') || '',
      platform: widget.getAttribute('data-platform') || '',
      vertical: widget.getAttribute('data-vertical') || '',
    }
    fetchMetric(metricUrl(id, params))
      .then(function (r) {
        if (!r.ok || !r.json || !r.json.data) return failure(body, r)
        var result = r.json.data
        if (!needsCurrencyFanOut(result, effectiveChart(chart, result))) {
          results.push({ widget: widget, result: result })
          return render(widget, result)
        }
        // One matrix per currency: fetch each, draw them side by side.
        var plan = fanOutPlan(result)
        var currencies = plan.fetch
        return Promise.all(
          currencies.map(function (c) {
            var p = {}
            for (var k in params) if (has(params, k)) p[k] = params[k]
            p.currency = c
            return fetchMetric(metricUrl(id, p))
          }),
        ).then(function (all) {
          var parts = []
          var failed = []
          all.forEach(function (x, i) {
            if (x.ok && x.json && x.json.data) {
              parts.push({ currency: currencies[i], label: currencies[i], result: x.json.data })
            } else failed.push(currencies[i])
          })
          if (parts.length === 0) return failure(body, all[0] || { status: 0, json: null })
          var fan = { parts: parts, notes: fanOutNotes(plan, failed) }
          results.push({ widget: widget, result: result, fan: fan })
          render(widget, result, fan)
        })
      })
      .catch(function () {
        setState(body, 'This chart could not be loaded.')
      })
  }

  function redrawAll() {
    if (observer) observer.disconnect()
    rendered.forEach(function (c) {
      c.dispose()
    })
    rendered = []
    results.forEach(function (r) {
      render(r.widget, r.result, r.fan)
    })
  }

  function start() {
    var widgets = root.querySelectorAll('[data-widget]')
    for (var i = 0; i < widgets.length; i++) load(widgets[i])
    document.addEventListener('os:themechange', redrawAll)
    if (typeof ResizeObserver !== 'undefined') return
    var pending = null
    window.addEventListener('resize', function () {
      clearTimeout(pending)
      pending = setTimeout(function () {
        rendered.forEach(function (c) {
          c.resize()
        })
      }, 100)
    })
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})(typeof window !== 'undefined' ? window : globalThis)
