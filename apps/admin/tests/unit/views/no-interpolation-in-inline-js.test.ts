/**
 * No server value may be interpolated into an inline JavaScript string.
 *
 * `onsubmit="return confirm('Delete <%= x %>?')"` puts a server value inside a
 * JS string literal that is itself inside an HTML attribute. EJS escapes for
 * HTML — an apostrophe becomes `&#39;` — but the browser HTML-decodes the
 * attribute *before* the JS engine parses it. The apostrophe comes back as a
 * real quote and ends the literal.
 *
 * Two consequences, and the mild one is the common one:
 *
 *   "Bob's Team"          -> SyntaxError, `form.onsubmit` is not a function,
 *                            and the destructive action then fires on the first
 *                            click with no dialog at all. No attacker involved.
 *   a'+alert(1)+'@x.yy    -> valid JavaScript, executed in the operator's
 *                            browser on the admin origin.
 *
 * The second was reachable: customer addresses arrive from the unauthenticated
 * self-register endpoint, which stores whatever passes a loose regex.
 *
 * The fix everywhere is the same — name the thing generically ("Delete this
 * customer?") and keep the value out of the string. The row already says which
 * record it belongs to.
 *
 * Escaping for a JS context would also work, but there is no helper for it here
 * and none of these dialogs are improved by the value, so the rule is simply
 * that the value stays out.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

const VIEWS = join(__dirname, '../../../views')

function everyView(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) everyView(full, found)
    else if (entry.endsWith('.ejs')) found.push(full)
  }
  return found
}

/** `on*="..."` handlers, which are the only inline-JS contexts in these views. */
const INLINE_HANDLER = /\son[a-z]+="([^"]*)"/g
const INTERPOLATION = /<%[=-]/

describe('inline event handlers carry no server values', () => {
  const files = everyView(VIEWS)

  it('is actually reading the views', () => {
    // Without this the rule below passes vacuously the moment the walker breaks.
    expect(files.length).toBeGreaterThan(30)
  })

  it('never interpolates into an inline handler', () => {
    const offenders: string[] = []

    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      for (const match of src.matchAll(INLINE_HANDLER)) {
        if (!INTERPOLATION.test(match[1])) continue
        const line = src.slice(0, match.index).split('\n').length
        offenders.push(`${file.slice(VIEWS.length + 1)}:${line} — ${match[0].slice(0, 80)}`)
      }
    }

    // A server value inside an inline handler is a JS-string context that HTML
    // escaping does not protect. Keep the value out of the handler: put it in
    // the surrounding markup, or drop it from the message entirely.
    expect(offenders).toEqual([])
  })

  it('still allows a handler with no interpolation', () => {
    // The rule must not have been satisfied by there being no handlers left.
    const withHandlers = files.filter((f) => /\son[a-z]+="/.test(readFileSync(f, 'utf8')))
    expect(withHandlers.length).toBeGreaterThan(3)
  })
})

describe('no raw JSON.stringify inside an inline <script>', () => {
  const files = everyView(VIEWS)

  it('never uses <%- JSON.stringify(...) %> (use jsonForScript instead)', () => {
    // `<%-` is unescaped output and JSON.stringify does not neutralize the
    // literal `</script>`, so a value carrying it breaks out of the element —
    // reflected/stored XSS on the operator console. The jsonForScript helper
    // (views/helpers.ts, in the view defaultContext) escapes the HTML-
    // significant characters; every in-script value must go through it.
    const offenders: string[] = []
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      for (const match of src.matchAll(/<%-\s*JSON\.stringify\(/g)) {
        const line = src.slice(0, match.index).split('\n').length
        offenders.push(`${file.slice(VIEWS.length + 1)}:${line}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
