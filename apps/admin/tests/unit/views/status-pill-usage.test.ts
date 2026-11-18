/**
 * Status vocabulary is rendered in one place.
 *
 * `statusPill()` maps every status the admin knows — connection, connect-link
 * session, sync job, webhook delivery — to a tone and a human label, and is
 * exposed to every template through the view context. Views that hand-roll a
 * badge around a raw status drift from it, and the drift is always in the same
 * direction: a hardcoded `badge--success` reports expired or errored records
 * as healthy. The platform page and the wizard's verify step both did exactly
 * that, showing a green pill reading "expired".
 *
 * Deliberately narrow: it flags a hardcoded badge tone wrapped directly around
 * a `.status` interpolation. Badges around other things — an HTTP response
 * code, an aggregate counter — are a different vocabulary and are left alone.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const VIEWS = join(__dirname, '../../../views')

function ejsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) ejsFiles(full, acc)
    else if (entry.endsWith('.ejs')) acc.push(full)
  }
  return acc
}

/** `<span class="badge badge--success">…<%= c.status %>` and friends. */
const HARDCODED_STATUS_BADGE =
  /badge--(success|warning|danger|info|accent)[^>]*>(?:\s*<span class="badge__dot"><\/span>)?\s*<%=\s*\w+\.status\s*%>/

describe('status badges', () => {
  it('are never hand-rolled around a raw status value', () => {
    const offenders = ejsFiles(VIEWS)
      .filter((f) => HARDCODED_STATUS_BADGE.test(readFileSync(f, 'utf8')))
      .map((f) => relative(VIEWS, f))
    expect(offenders).toEqual([])
  })

  it('still inspects the templates it is meant to', () => {
    expect(ejsFiles(VIEWS).length).toBeGreaterThan(20)
  })
})
