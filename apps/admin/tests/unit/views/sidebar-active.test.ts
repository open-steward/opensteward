/**
 * The sidebar says which page you are on.
 *
 * `.sidebar__link--active` has existed in the design system since the sidebar
 * was built, but nothing ever applied it — every page rendered an identical
 * nav, so the only way to know where you were was to read the URL.
 *
 * The matcher is tested directly rather than through rendered pages, because
 * what makes a nav highlight wrong is never the page you built it for: it is
 * the nested route, the one that shares a prefix, and the detail page three
 * levels down. Those are cheap to enumerate here and awkward to reach over
 * HTTP.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { activeNavHref, navLinkAttrs, NAV_HREFS } from '../../../src/core/views/helpers'

describe('activeNavHref', () => {
  it('matches a page to its own entry', () => {
    expect(activeNavHref('/connections')).toBe('/connections')
    expect(activeNavHref('/audit')).toBe('/audit')
  })

  it('lights the dashboard only on the dashboard', () => {
    // "/" is a prefix of every path — without an exact-match rule it would be
    // permanently lit alongside whatever page you are actually on.
    expect(activeNavHref('/')).toBe('/')
    expect(activeNavHref('/connections')).not.toBe('/')
    expect(activeNavHref('/settings/system')).not.toBe('/')
  })

  it('lights the section from a detail page', () => {
    expect(activeNavHref('/connections/accounting/conn_1')).toBe('/connections')
    expect(activeNavHref('/platforms/accounting/xero')).toBe('/platforms')
    expect(activeNavHref('/customers/cus_42')).toBe('/customers')
  })

  it('prefers the deeper entry for a nested route', () => {
    // Both /settings and /settings/system match; longest wins, or System could
    // never be shown as current.
    expect(activeNavHref('/settings/system')).toBe('/settings/system')
    expect(activeNavHref('/settings')).toBe('/settings')
  })

  it('does not let an entry claim another that merely shares its prefix', () => {
    // '/connect-link-templates'.startsWith('/connect-links') is false, but
    // '/connect-link-templates'.startsWith('/connect-link') is true — a
    // boundary-free check lights two entries at once.
    expect(activeNavHref('/connect-link-templates')).toBe('/connect-link-templates')
    expect(activeNavHref('/connect-links')).toBe('/connect-links')
    expect(activeNavHref('/connect-links/new')).toBe('/connect-links')
  })

  it('lights the wizard from any step inside it', () => {
    expect(activeNavHref('/setup/wizard')).toBe('/setup/wizard')
    expect(activeNavHref('/setup/wizard/logos')).toBe('/setup/wizard')
    expect(activeNavHref('/setup/wizard/company-info')).toBe('/setup/wizard')
  })

  it('ignores the query string and the fragment', () => {
    // /platforms?tab=logos is the same page as /platforms.
    expect(activeNavHref('/platforms?tab=logos')).toBe('/platforms')
    expect(activeNavHref('/connections?status=error&vertical=crm')).toBe('/connections')
    expect(activeNavHref('/audit#top')).toBe('/audit')
  })

  it('marks nothing for a page outside the nav', () => {
    expect(activeNavHref('/login')).toBeNull()
    expect(activeNavHref('/setup/init')).toBeNull()
    expect(activeNavHref('/nowhere')).toBeNull()
    // Notifications moved to the header bell, which marks itself current.
    expect(activeNavHref('/notifications')).toBeNull()
  })

  it('does not fall over on an empty path', () => {
    expect(activeNavHref('')).toBe('/')
  })

  it('never marks two entries for one path', () => {
    // The property that matters, checked across every entry rather than the
    // handful above: a page belongs to exactly one place in the nav.
    for (const href of NAV_HREFS) {
      const matches = NAV_HREFS.filter((h) => activeNavHref(href) === h)
      expect(matches).toHaveLength(1)
    }
  })
})

describe('navLinkAttrs', () => {
  it('marks the current entry for both sighted and screen-reader users', () => {
    const attrs = navLinkAttrs('/connections', '/connections/accounting/conn_1')
    expect(attrs).toContain('sidebar__link--active')
    // aria-current is the half that a screenshot review would never catch.
    expect(attrs).toContain('aria-current="page"')
  })

  it('leaves every other entry plain', () => {
    expect(navLinkAttrs('/audit', '/connections')).toBe(' class="sidebar__link"')
    expect(navLinkAttrs('/audit', '/connections')).not.toContain('aria-current')
  })
})

describe('the nav list matches the sidebar markup', () => {
  it('covers every link the layout renders', () => {
    // Adding a sidebar link without adding its href here would silently lose
    // the highlight for that one page — the kind of gap nobody notices until
    // they are on it.
    const layout = readFileSync(join(__dirname, '../../../views/layout.ejs'), 'utf8')
    const rendered = [...layout.matchAll(/nav\('([^']+)'\)/g)].map((m) => m[1])

    expect(rendered.length).toBeGreaterThan(15)
    for (const href of rendered) {
      expect(NAV_HREFS).toContain(href)
    }
  })

  it('has no entry the sidebar does not render', () => {
    const layout = readFileSync(join(__dirname, '../../../views/layout.ejs'), 'utf8')
    const rendered = new Set([...layout.matchAll(/nav\('([^']+)'\)/g)].map((m) => m[1]))
    for (const href of NAV_HREFS) {
      expect(rendered.has(href)).toBe(true)
    }
  })

  it('keeps the notifications bell out of the sidebar', () => {
    // The bell is a header control with its own aria-current, not a nav entry:
    // listing it here would light a sidebar link that no longer exists, and
    // rendering it through nav() would give it the sidebar's classes.
    const layout = readFileSync(join(__dirname, '../../../views/layout.ejs'), 'utf8')
    expect(NAV_HREFS).not.toContain('/notifications')
    expect(layout).not.toContain("nav('/notifications')")
    const aside = /<aside class="sidebar">[\s\S]*?<\/aside>/.exec(layout)?.[0] ?? ''
    expect(aside.length).toBeGreaterThan(0)
    expect(aside).not.toContain('/notifications')
    const header = /<header class="app-header">[\s\S]*?<\/header>/.exec(layout)?.[0] ?? ''
    expect(header).toContain('href="/notifications"')
  })
})
