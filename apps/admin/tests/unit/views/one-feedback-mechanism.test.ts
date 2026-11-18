/**
 * The admin reports an action's outcome in exactly one way.
 *
 * Query-flag reporting — a `?saved=1` read back into a banner or toast — is
 * banned: a message in the URL is a property of that address, not an event,
 * so Back, Forward, a refresh or a shared link all replay "Saved." for
 * something that had not just happened.
 *
 * The rule:
 *
 *   An outcome that survives a navigation is a flash (core/flash.ts → toast).
 *   An outcome that belongs to a form still on screen stays inline.
 *   A value the operator must copy is document content, rendered by the
 *   handler that produced it — never a redirect, because `req.url` is not
 *   redacted from the request log.
 *
 * These rules are deliberately specific about WHICH keys are banned rather than
 * banning query parameters generally: `?tab=logos`, `?vertical=`, `?reveal=`
 * and friends are navigation and must stay free to grow.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const ADMIN = join(__dirname, '../../..')
const VIEWS = join(ADMIN, 'views')
const ROUTES = join(ADMIN, 'src/core/routes')

function filesUnder(dir: string, ext: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) filesUnder(full, ext, acc)
    else if (entry.endsWith(ext)) acc.push(full)
  }
  return acc
}

/** Message keys that must never travel in a URL. */
const MESSAGE_KEYS = 'saved|deleted|error|updated|reset|synced|syncError|purged|minted|created|url'

/**
 * `?wizard=complete` is the one exemption, and it is not a migration
 * oversight: the two links that set it are plain `<a href>`s in
 * views/wizard/step7-webhook.ejs, so there is no response to attach a cookie
 * to, and what it renders on the dashboard is a multi-paragraph next-steps
 * panel that a toast could not hold. It replays on Back — truthfully and
 * idempotently, which is a different thing from a false "Deleted."
 */
const EXEMPT_QUERY_KEYS = ['wizard']

describe('one feedback mechanism', () => {
  const views = filesUnder(VIEWS, '.ejs')
  const routes = filesUnder(ROUTES, '.ts')

  it('is looking at the files it thinks it is', () => {
    // Guards against a moved directory turning every rule below into a no-op.
    expect(views.length).toBeGreaterThan(20)
    expect(routes.length).toBeGreaterThan(10)
  })

  it('no route redirects with a message in the URL', () => {
    // Whitespace-normalised before matching, deliberately: a line-based grep
    // misses `reply.redirect(` split from its argument across lines, which is
    // exactly how both plaintext-token leaks hid.
    const pattern = new RegExp(String.raw`reply\s*\.\s*redirect\(\s*[^)]*?[?&](${MESSAGE_KEYS})=`)
    const offenders = routes.filter((f) =>
      pattern.test(readFileSync(f, 'utf8').replace(/\s+/g, ' ')),
    )
    expect(offenders.map((f) => relative(ADMIN, f))).toEqual([])
  })

  it('no route reads a message key off the query string', () => {
    const pattern = new RegExp(String.raw`request\.query\.(${MESSAGE_KEYS})\b`)
    const offenders = routes.filter((f) => pattern.test(readFileSync(f, 'utf8')))
    expect(offenders.map((f) => relative(ADMIN, f))).toEqual([])
  })

  it('only the two allowlisted views call oiToast directly', () => {
    // layout.ejs defines it and uses it for the copy-to-clipboard handler.
    // _logo-fetch.ejs announces a long-poll result — a live event during this
    // page's lifetime, which is genuinely not a page-load flash.
    const allowed = new Set(['views/layout.ejs', 'views/platforms/_logo-fetch.ejs'])
    const offenders = views
      .filter((f) => readFileSync(f, 'utf8').includes('window.oiToast('))
      .map((f) => relative(ADMIN, f))
      .filter((f) => !allowed.has(f))
    expect(offenders).toEqual([])
  })

  it('no route passes a `flashes` local', () => {
    // The hook publishes `reply.locals.flashes`, and @fastify/view merges
    // per-call data OVER locals — so a route passing the same key would
    // silently swallow every message on that page, with no error. `flash`
    // (singular) was already taken by two routes for exactly this reason.
    const offenders = routes.filter((f) => /\bflashes\s*:/.test(readFileSync(f, 'utf8')))
    expect(offenders.map((f) => relative(ADMIN, f))).toEqual([])
  })

  it('no route puts a minted secret in a redirect', () => {
    // `req.url` is not in LOG_REDACT_PATHS, so a redirect carrying a plaintext
    // token writes a live credential to stdout as well as to browser history.
    const pattern = /reply\s*\.\s*redirect\([^)]*(plaintext|\.token\b|session\.url)/
    const offenders = routes.filter((f) =>
      pattern.test(readFileSync(f, 'utf8').replace(/\s+/g, ' ')),
    )
    expect(offenders.map((f) => relative(ADMIN, f))).toEqual([])
  })

  it('keeps form validation inline, where the field is', () => {
    // The counterpart to the bans above: without this, the other rules read as
    // "toasts everywhere", and a sticky toast in the viewport corner is worse
    // than an error beside the input it describes (WCAG 3.3.1). These also
    // cannot use a flash — sameSite=strict drops it across the SSO origin hop.
    for (const view of [
      'login.ejs',
      'setup/init.ejs',
      'api-keys/index.ejs',
      'webhooks/index.ejs',
    ]) {
      expect(readFileSync(join(VIEWS, view), 'utf8')).toMatch(/\berror\b|\bminted\b|\bcreated\b/)
    }
  })

  it('allows navigational query parameters to keep growing', () => {
    // Proof the rules above ban message keys, not query strings: `tab=logos`
    // is navigation and survives every redirect on the Logos tab.
    const platforms = readFileSync(join(ROUTES, 'platforms.ts'), 'utf8')
    expect(platforms).toContain("redirect('/platforms?tab=logos')")
    for (const key of EXEMPT_QUERY_KEYS) expect(typeof key).toBe('string')
  })
})

describe('every view still compiles', () => {
  // Not decoration. Editing these templates by pattern is how this codebase
  // removes a banner, and a non-greedy match that eats one `<% } %>` too many
  // leaves a file that parses as far as the test harness cares but throws at
  // render time — on a page reached only after a specific action. Two views
  // broke exactly that way while this change was being made.
  it('parses', async () => {
    const ejs = await import('ejs')
    const broken: string[] = []
    for (const file of filesUnder(VIEWS, '.ejs')) {
      try {
        ejs.compile(readFileSync(file, 'utf8'), { filename: file })
      } catch (err) {
        broken.push(`${relative(ADMIN, file)}: ${(err as Error).message.split('\n')[0]}`)
      }
    }
    expect(broken).toEqual([])
  })
})
