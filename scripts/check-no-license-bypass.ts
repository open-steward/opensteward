/**
 * CI guard: the license check has no off switch and no side door.
 * Handover A §5.2: "No bypass of any kind". §3: never branch on tier. §5.9:
 * zero license-related network calls. P1: licensing reads no environment.
 *
 * Rules, over application source (apps/<a>/src, packages/<p>/src). Tests,
 * dist, node_modules and fixtures are excluded, and whole-line comments are
 * ignored:
 *   license-env               an environment read whose name matches LICEN[CS]E
 *                             or ENTITLE. The one exception is
 *                             OPENSTEWARD_LICENSE(_FILE) read by
 *                             apps/integration-server/src/config.ts (D-A: one
 *                             license authority).
 *   bypass-token              a name shaped like an off switch: an identifier,
 *                             settings key or CLI flag, in any case, with `_`,
 *                             `-`, `.` or camelCase between its words. It names
 *                             the license (or entitlements) beside an off word
 *                             (SKIP_LICENSE, licenseDisabled, 'skip_license',
 *                             --disable-license, LICENSE_OVERRIDE,
 *                             fakeLicense), ends in a toggle word after it
 *                             (licenseEnabled, LICENSE_ENFORCEMENT,
 *                             licenseCheck, LICENSE_REQUIRED,
 *                             --no-license-check), ends in it after
 *                             enforce/enable/require (enforceLicense,
 *                             requireLicense), or pairs "unlicensed" with a
 *                             switch word (unlicensedMode, ALLOW_UNLICENSED).
 *                             Not a switch: the license as the agent
 *                             (disabledByLicense), the unlicensed state
 *                             (unlicensedVerticals), a check as an event
 *                             (lastLicenseCheck, nextLicenseCheck). A verb
 *                             that runs the check is a switch
 *                             (runLicenseCheck: false).
 *   licensing-env             ANY use of the process environment inside
 *                             packages/shared/src/licensing or
 *                             packages/license-token/src. NODE_ENV is not
 *                             exempt: whether dev keys are trusted depends only
 *                             on the build (P1).
 *   keyring-outside-licensing getKeyring(, verifyLicense( or keys.dev outside
 *                             licensing/. The token package may also define
 *                             verifyLicense.
 *   dev-kid-literal           a quoted dev kid outside keys.dev.ts
 *   dev-module-import         keys.dev imported, re-exported or required, in
 *                             quotes or backticks, except the one allowed form:
 *                             require('./keys.dev') (quotes, no extension)
 *                             inside a try in keyring.ts. Production images
 *                             delete that module, so a hard dependency on it
 *                             crashes every container.
 *   tier-branch               a comparison, switch, includes(), lookup or
 *                             method call on `tier` (s.tier, s['tier'], a
 *                             renamed destructure `{ tier: t }`, or a plain
 *                             alias `const t = s.tier`) in code that touches
 *                             licensing, by package or relative import or
 *                             through LicenseStatus(DTO), outside the display
 *                             code (licensing/log.ts, licensing/dto.ts,
 *                             apps/admin)
 *   licensing-imports         licensing/ or the token package importing
 *                             anything except: node crypto/fs/path, zod, the
 *                             token package, type-only ../db (shared only), or
 *                             their own files (a relative path is resolved, so
 *                             './../x' is not "own"). So no network client and
 *                             no runtime settings. import(), require() and
 *                             process.getBuiltinModule() are held to the same
 *                             list; a computed specifier is refused.
 *   licensing-network         a global network call in licensing or the token
 *                             package (fetch, WebSocket, EventSource,
 *                             XMLHttpRequest, WebTransport, sendBeacon),
 *                             directly, through the global object (globalThis,
 *                             global, self, window; cast or not), taken out
 *                             of it first (`const { fetch: f } = global`,
 *                             `const g: any = globalThis`, a parameter default
 *                             `g = globalThis`), or taken uncalled
 *                             (`const f = fetch`, `retry(fetch, u)`). They need
 *                             no import, so licensing-imports cannot see them
 *                             (§5.9). A method named fetch and text inside a
 *                             string are not calls.
 *
 * Aimed at convenience flags and accidents, not deliberate obfuscation (review
 * and the ELv2 anti-circumvention clause cover that).
 *
 * The run also checks its own reach: it fails, `--soft` included, unless it
 * scanned integration-server's config.ts and files under both licensing
 * directories, so a scan that reads nothing cannot report success.
 *
 * Run: `pnpm check:no-license-bypass` (add `--soft` to report findings only).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(import.meta.dirname, '..')
export const ALLOWED_LICENSE_ENV: ReadonlySet<string> = new Set([
  'OPENSTEWARD_LICENSE',
  'OPENSTEWARD_LICENSE_FILE',
])
export const LICENSE_ENV_READER = 'apps/integration-server/src/config.ts'
export const LICENSING = 'packages/shared/src/licensing/'
export const TOKEN_PKG = 'packages/license-token/src/'
/** The top-level directories whose `<name>/src` trees are scanned. */
export const SCAN_ROOTS: readonly string[] = ['apps', 'packages']
const DEV_KEYS_FILE = `${LICENSING}keys.dev.ts`
const KEYRING_FILE = `${LICENSING}keyring.ts`
/** Code that may read `tier` to SHOW it. Gating reads features and limits only (§3). */
export const TIER_DISPLAY: readonly string[] = [
  `${LICENSING}log.ts`,
  `${LICENSING}dto.ts`,
  'apps/admin/src/',
]
/** What licensing and the token package may import (§5.9 no network; P3 no runtime settings). */
export const LICENSING_IMPORTS: ReadonlySet<string> = new Set([
  'node:crypto',
  'crypto',
  'node:fs',
  'fs',
  'node:fs/promises',
  'fs/promises',
  'node:path',
  'path',
  'zod',
  '@opensteward/license-token',
])
/** From shared licensing only, and only as `import type` / `export type`: resolved repo paths. */
const LICENSING_TYPE_IMPORTS: ReadonlySet<string> = new Set([
  'packages/shared/src/db',
  'packages/shared/src/db/types',
])

export interface BypassViolation {
  file: string
  line: number
  rule: string
  snippet: string
}

const ENV_READ =
  /process\s*\??\.\s*env(?:\s*\??\.\s*([A-Za-z_$][\w$]*)|\s*(?:\?\.)?\s*\[\s*(['"`])([^'"`]+)\2\s*\])|numericEnv\(\s*['"]([^'"]+)['"]/g
const ENV_DESTRUCTURE = /\{([^{}]*)\}\s*=\s*process\s*\??\.\s*env\b/g
const LICENSE_NAME = /LICEN[CS]E|ENTITLE/i

/** An identifier, a dotted path, a settings key or a CLI flag: words joined by `_`, `-`, `.` or camelCase. */
const NAME_TOKEN = /[A-Za-z_$][\w$]*(?:[-.][A-Za-z_$][\w$]*)*/g
const LICENSE_WORD = /^(?:licen[cs](?:e|es|ed|ing)|entitlements?)$/
const OFF_WORD =
  /^(?:skip|skips|skipped|skipping|disable|disabled|disables|disabling|bypass|bypassed|bypasses|bypassing|ignore|ignored|ignores|ignoring|off|override|overrides|overridden|overriding|fake|faked|fakes|faking)$/
/** The last word of a toggle named after the license: licenseEnabled, LICENSE_ENFORCEMENT, licenseCheck, LICENSE_REQUIRED. */
const SWITCH_TAIL =
  /^(?:checks?|checking|enabled?|enforced?|enforcement|enforcing|required|optional)$/
/**
 * The word before a final license word in a toggle: enforceLicense, ENABLE_LICENSE, requireLicense.
 * Not `requires`: requiresLicense and featureRequiresLicense are predicates, not switches.
 */
const SWITCH_HEAD = /^(?:enforce|enforced|enforcing|enable|require|required|optional)$/
/** The tails a word before the license can turn into an event: lastLicenseCheck. */
const CHECK_TAIL = /^(?:checks?|checking)$/
/**
 * A word before the license that says WHEN a check happens, so the name is an
 * event, not a toggle: lastLicenseCheck, nextLicenseCheck. A verb that says
 * WHETHER it happens is not one: runLicenseCheck, performLicenseCheck and
 * startLicenseCheck read as switches (`runLicenseCheck: false`).
 */
const EVENT_WORD = /^(?:last|next|previous|prev|first|scheduled)$/
const UNLICENSED_WORD = /^unlicen[cs]ed$/
/**
 * What turns "unlicensed" into a switch (unlicensedMode, ALLOW_UNLICENSED), not a
 * state (isUnlicensed): a permission, a mode, or a convenience that reads as one
 * (UNLICENSED_DEV, UNLICENSED_ACCESS, useUnlicensed, unlicensedFallback; review r14).
 */
const UNLICENSED_SWITCH =
  /^(?:allow|allows|allowed|permit|permits|permitted|accept|accepts|accepted|mode|ok|run|runs|enable|enabled|force|use|uses|using|dev|debug|local|test|testing|demo|access|fallback)$/

/** Lower-case words of a name: skipLicenseCheck, SKIP_LICENSE_CHECK and --skip-license-check all give skip license check. */
export function nameWords(token: string): string[] {
  return token
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z\d]+/)
    .filter(Boolean)
}

/**
 * True when a name reads like a license off switch. A word must END the toggle
 * forms, so LICENSE_CHECK_INTERVAL_MS, checkLicense and enforceLicenseLimit are
 * ordinary vocabulary, and prose (words split by spaces) never matches.
 *
 * Narrowed for vocabulary that is not a switch (each is a test case): the
 * license as the agent (disabledByLicense: the license is what disables), the
 * unlicensed state without a switch word (unlicensedVerticals, isUnlicensed),
 * and a check as an event (lastLicenseCheck, nextLicenseCheck). Only a check
 * can be an event: RUN_LICENSE_ENFORCEMENT and startLicenseEnforcement stay
 * switches.
 */
export function isBypassName(token: string): boolean {
  const w = nameWords(token)
  if (w.some((x) => UNLICENSED_WORD.test(x)))
    return w.some((x) => UNLICENSED_SWITCH.test(x) || OFF_WORD.test(x))
  const lic = w.findIndex((x, i) => LICENSE_WORD.test(x) && w[i - 1] !== 'by')
  if (lic === -1) return false
  if (w.some((x) => OFF_WORD.test(x))) return true
  const last = w.length - 1
  const tail = w[last]!
  const event = CHECK_TAIL.test(tail) && EVENT_WORD.test(w[lic - 1] ?? '')
  if (last > lic && SWITCH_TAIL.test(tail) && !event) return true
  return last > 0 && LICENSE_WORD.test(tail) && SWITCH_HEAD.test(w[last - 1]!)
}

const PROCESS_ENV_ANY =
  /\bprocess\s*(?:\??\.\s*env\b|(?:\?\.)?\s*\[\s*['"`]env['"`]\s*\])|\{[^{}]*\benv\b[^{}]*\}\s*=\s*process\b/g
const DEV_KID = /['"`]devk?1['"`]/g
const TIER_BRANCH = new RegExp(
  [
    String.raw`\.tier\s*[!=]==?`,
    String.raw`[!=]==?\s*[\w$.?!()]*\.tier\b`,
    String.raw`\bswitch\s*\(\s*[\w$.?!()]*\btier\s*\)`,
    String.raw`\btier\s*[!=]==?\s*['"${'`'}]`,
    String.raw`['"${'`'}]\s*[!=]==?\s*tier\b`,
    // ['pro', 'enterprise'].includes(s.tier), includes(s.tier ?? ''), TIER_FEATURES[s.tier], s.tier.startsWith('ent')
    String.raw`\.includes\s*\(\s*[\w$.?!()]*\.tier\b`,
    String.raw`\[\s*[\w$.?!()]*\.tier\s*\]`,
    String.raw`\.tier\s*\??\.\s*[\w$]+\s*\(`,
  ].join('|'),
  'g',
)
/** s['tier'] and s?.['tier'] read the same field as s.tier: rewritten to it (same length) before TIER_BRANCH runs. */
const TIER_INDEX = /(?:\?\.)?\[\s*(['"`])tier\1\s*\]/g
/** `const { tier: t } = s`: the alias then branches like a bare `tier`. */
const TIER_ALIAS = /\{[^{}]*?\btier\s*:\s*([A-Za-z_$][\w$]*)\s*(?=[,}=])/g
/**
 * `const t = s.tier` (optionally typed, or with a `?? default`): a plain alias,
 * held to the same rules. Only when the declaration ends right there: a value
 * derived from tier (`s.tier ? 'Paid' : 'Free'`, `s.tier.length`) is not it.
 */
const TIER_VAR =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;\n]+)?=\s*[\w$.?!()]*\.tier\s*(?:\?\?\s*(?:'[^'\n]*'|"[^"\n]*"|`[^`\n]*`|[\w$.]+)\s*)?(?=[;,)\n]|$)/gm
const escapeRegExp = (s: string) => s.replace(/[$]/g, '\\$&')
/** The comparisons and switch a bare `tier` is held to, for an alias of it. */
const aliasBranch = (alias: string) => {
  const a = escapeRegExp(alias)
  return new RegExp(
    [
      String.raw`\b${a}\s*[!=]==?\s*['"${'`'}]`,
      String.raw`['"${'`'}]\s*[!=]==?\s*${a}(?![\w$])`,
      String.raw`\bswitch\s*\(\s*${a}\s*\)`,
    ].join('|'),
    'g',
  )
}
/**
 * Code that touches licensing: the package imports, a relative import of a
 * licensing directory (shared's control-plane reaches it as '../licensing/…'),
 * the status types (LicenseStatus, LicenseStatusDTO), or the manager's calls.
 */
const LICENSING_CONTEXT =
  /@opensteward\/(?:shared\/licensing|license-token)\b|['"`](?:\.{1,2}\/)+(?:[\w.-]+\/)*licensing(?:\/[\w.-]+)*['"`]|\bLicenseStatus(?:DTO)?\b|\blicense\.(?:current|entitlements)\s*\(/
/** `import`/`export … from '<spec>'` and side-effect `import '<spec>'`. A brace list may span lines and hold comments. */
const STATIC_IMPORT = new RegExp(
  String.raw`\b(import|export)\s+(type\s+)?(?:(?:(?:[\w$]+\s*,\s*)?(?:\{[^{}]*\}|\*(?:\s*as\s+[\w$]+)?)|[\w$]+)\s*from\s*)?['"]([^'"]+)['"]`,
  'g',
)
/** import(), require() and process.getBuiltinModule() (Node 22.3+), which loads a built-in with no import statement. */
const LOADER = String.raw`\b(?:import|require|getBuiltinModule)\s*(?:\?\.)?\s*\(`
const DYNAMIC_IMPORT = new RegExp(String.raw`${LOADER}\s*(['"${'`'}])([^'"${'`'}]+)\1\s*\)`, 'g')
/** import(name), require(name), or a template literal with an interpolation: import(`node:${x}`). */
const COMPUTED_IMPORT = new RegExp(
  String.raw`${LOADER}\s*(?:(?![\s'"${'`'}])|${'`'}[^${'`'}]*\$\{)`,
  'g',
)
const NETWORK_GLOBALS = 'fetch|WebSocket|EventSource|XMLHttpRequest|WebTransport'
/**
 * The global object under each name code reaches it by: globalThis, Node's
 * `global`, a worker's `self`, a browser's `window`. Not after a `.`
 * (opts.window is a property), and optionally cast: `(global as any)`.
 */
const GLOBAL_OBJECT = String.raw`(?<![.\w$])(?:globalThis|global|self|window)\b`
const GLOBAL_CAST = String.raw`(?:[ \t]+as[ \t]+[^();\n]*\))?`
/** `: any` on a declared name, before its `=`. */
const TYPE_NOTE = String.raw`(?::[^=;\n]*)?`
/**
 * Run over the source with string contents blanked, so 'fetch(' in a message
 * is not a call. A name after `.` is a method (this.store.fetch(id)), not the
 * global; the global reached through the global object, or taken out of it, is.
 */
const NETWORK_CALL = new RegExp(
  [
    String.raw`(?<![.\w$])(?:${NETWORK_GLOBALS})\s*\(`,
    String.raw`\bnew\s+(?:${NETWORK_GLOBALS})\b`,
    String.raw`${GLOBAL_OBJECT}${GLOBAL_CAST}\s*\??\.\s*(?:${NETWORK_GLOBALS})\b`,
    // const { fetch: f } = global, then f(u)
    String.raw`\{[^{}]*\b(?:${NETWORK_GLOBALS})\b[^{}]*\}\s*${TYPE_NOTE}=\s*\(?\s*${GLOBAL_OBJECT}`,
    // const g = globalThis, const g: any = global, const g = globalThis as any; then g.fetch(u)
    String.raw`\b(?:const|let|var)\s+[\w$]+\s*${TYPE_NOTE}=[ \t]*\(?[ \t]*${GLOBAL_OBJECT}[ \t]*\)?(?:[ \t]+as[ \t]+[^;\n]*)?[ \t]*(?:;|$)`,
    // A parameter default or a plain assignment: function f(g = globalThis), g = global (review r16)
    String.raw`(?:[(,]|^)[ \t]*[\w$]+[ \t]*(?::[^=,()\n]*)?=[ \t]*\(?[ \t]*${GLOBAL_OBJECT}[ \t]*\)?(?:[ \t]+as[ \t]+[^,;)\n]*)?[ \t]*(?=[,);]|$)`,
    // The global itself, taken without a call: const f = fetch, retry(fetch, u), fetch.bind(x) (review r16)
    String.raw`(?:=|[(,])[ \t]*(?:${NETWORK_GLOBALS})\b(?![ \t]*[(\w$])`,
    String.raw`\bsendBeacon\s*\(`,
  ].join('|'),
  'gm',
)
/** globalThis['fetch'], global['fetch']: needs the string, so it runs over the source as written. */
const NETWORK_INDEX = new RegExp(
  String.raw`${GLOBAL_OBJECT}${GLOBAL_CAST}\s*(?:\?\.)?\s*\[\s*['"${'`'}](?:${NETWORK_GLOBALS})['"${'`'}]`,
  'g',
)
/**
 * Blanks the text of string literals that open and close on one line ('…',
 * "…", `…`), keeping the quotes, the length and a template's `${…}` code, so
 * offsets and line numbers hold. Each line is read on its own: a quote with no
 * partner on its line stays code, so a quote inside a regex literal can hide
 * code on that one line at most.
 */
export function blankStrings(source: string): string {
  return source.split('\n').map(blankLine).join('\n')
}

function blankLine(line: string): string {
  let out = ''
  let i = 0
  while (i < line.length) {
    const quote = line[i]!
    const end = quote === "'" || quote === '"' || quote === '`' ? closingQuote(line, i) : -1
    if (end === -1) {
      out += quote
      i++
      continue
    }
    out += quote
    for (let j = i + 1; j < end; j++) {
      if (quote === '`' && line[j] === '$' && line[j + 1] === '{') {
        const close = closingBrace(line, j + 1)
        out += line.slice(j, close + 1)
        j = close
      } else out += ' '
    }
    out += quote
    i = end + 1
  }
  return out
}

/** The index of the quote that closes the literal opened at `start` on this line, or -1. */
function closingQuote(line: string, start: number): number {
  const quote = line[start]
  for (let j = start + 1; j < line.length; j++) {
    if (line[j] === '\\') j++
    else if (quote === '`' && line[j] === '$' && line[j + 1] === '{') j = closingBrace(line, j + 1)
    else if (line[j] === quote) return j
  }
  return -1
}

/** The index of the `}` that closes the `{` at `open` (a depth count), or the line's end. */
function closingBrace(line: string, open: number): number {
  let depth = 0
  for (let j = open; j < line.length; j++) {
    if (line[j] === '{') depth++
    else if (line[j] === '}' && --depth === 0) return j
  }
  return line.length - 1
}
/**
 * The pre-filter for files outside licensing: a file none of these words
 * appear in cannot break a rule, so it is not parsed. Every unit-test input
 * that produces a finding is also checked against it. `licensing` is a
 * trigger of its own (it does not contain "license"): a file that reaches
 * licensing only through '../licensing/errors' or '@opensteward/shared/licensing'
 * must still be parsed for tier-branch.
 */
const TRIGGER =
  /process\s*(?:\??\.|\[)\s*['"`]?env|numericEnv|licen[cs](?:e|ing)|entitle|devk?1|keys\.dev|getKeyring|verifyLicense/i

/**
 * Blanks whole-line comments (`// …` lines, and block comments that start a
 * line), keeping every newline so line numbers hold. Trailing comments after
 * code are kept: a regex cannot tell `//` inside a string from a comment.
 */
export function stripLineComments(source: string): string {
  let inBlock = false
  return source
    .split('\n')
    .map((line) => {
      if (inBlock) {
        const end = line.indexOf('*/')
        if (end === -1) return ''
        inBlock = false
        return ' '.repeat(end + 2) + line.slice(end + 2)
      }
      const trimmed = line.trimStart()
      if (trimmed.startsWith('//')) return ''
      if (trimmed.startsWith('/*')) {
        const start = line.indexOf('/*')
        const end = line.indexOf('*/', start + 2)
        if (end === -1) {
          inBlock = true
          return ''
        }
        return ' '.repeat(end + 2) + line.slice(end + 2)
      }
      return line
    })
    .join('\n')
}

/** True when `index` sits inside a `try { … }` that a `catch` follows (a brace count: enough for one guarded require). */
export function insideTry(source: string, index: number): boolean {
  const tries = [...source.slice(0, index).matchAll(/\btry\s*\{/g)]
  for (let t = tries.length - 1; t >= 0; t--) {
    const open = tries[t]!.index + tries[t]![0].length
    let depth = 1
    let p = open
    for (; p < source.length && depth > 0; p++) {
      if (source[p] === '{') depth++
      else if (source[p] === '}') depth--
    }
    const close = p - 1
    if (index > open && index < close) return /^\s*catch\b/.test(source.slice(close + 1))
  }
  return false
}

const lineOf = (s: string, i: number) => s.slice(0, i).split('\n').length

/** Where a relative specifier lands, as a repo path without a script extension or a trailing /index. */
function resolveSpecifier(file: string, spec: string): string {
  return posix
    .normalize(posix.join(posix.dirname(file), spec))
    .replace(/\.[cm]?[jt]sx?$/, '')
    .replace(/\/index$/, '')
}

export function findBypassViolations(file: string, original: string): BypassViolation[] {
  const source = stripLineComments(original)
  const lines = original.split('\n')
  const out: BypassViolation[] = []
  const add = (rule: string, index: number) => {
    const line = lineOf(source, index)
    out.push({ file, line, rule, snippet: lines[line - 1]?.trim() ?? '' })
  }
  const inLicensing = file.startsWith(LICENSING)
  const inToken = file.startsWith(TOKEN_PKG)

  const reads: Array<{ name: string; index: number }> = []
  for (const m of source.matchAll(ENV_READ))
    reads.push({ name: m[1] ?? m[3] ?? m[4] ?? '', index: m.index })
  for (const m of source.matchAll(ENV_DESTRUCTURE))
    for (const part of m[1]!.split(',')) {
      const name = part.split(':')[0]!.trim()
      if (name) reads.push({ name, index: m.index })
    }
  for (const { name, index } of reads)
    if (LICENSE_NAME.test(name) && !(ALLOWED_LICENSE_ENV.has(name) && file === LICENSE_ENV_READER))
      add('license-env', index)

  for (const m of source.matchAll(NAME_TOKEN)) if (isBypassName(m[0])) add('bypass-token', m.index)
  if (inLicensing || inToken)
    for (const m of source.matchAll(PROCESS_ENV_ANY)) add('licensing-env', m.index)

  if (!inLicensing) {
    for (const m of source.matchAll(/\bgetKeyring\s*\(|\bkeys\.dev\b/g))
      add('keyring-outside-licensing', m.index)
    if (!inToken)
      for (const m of source.matchAll(/\bverifyLicense\s*\(/g))
        add('keyring-outside-licensing', m.index)
  }
  if (file !== DEV_KEYS_FILE)
    for (const m of source.matchAll(DEV_KID)) add('dev-kid-literal', m.index)
  // `keys.dev`, with or without a .js/.ts extension, in quotes or backticks
  // (A2c-2's DEV_MODULE_REF accepts the same forms).
  for (const m of source.matchAll(
    /\bfrom\s*['"][^'"]*keys\.dev(?:\.[cm]?[jt]s)?['"]|\bimport\s*\(\s*(['"`])[^'"`]*keys\.dev(?:\.[cm]?[jt]s)?\1\s*\)/g,
  ))
    add('dev-module-import', m.index)
  // The one allowed form: require('./keys.dev') in quotes, inside a try in
  // keyring.ts. No extension ('./keys.dev' resolves to the .js in dist and the
  // .ts in source) and no backtick.
  for (const m of source.matchAll(
    /\brequire\s*\(\s*(['"`])[^'"`]*keys\.dev(?:\.[cm]?[jt]s)?\1\s*\)/g,
  ))
    if (
      file !== KEYRING_FILE ||
      !/^require\s*\(\s*(['"])\.\/keys\.dev\1\s*\)$/.test(m[0]) ||
      !insideTry(source, m.index)
    )
      add('dev-module-import', m.index)

  const display = TIER_DISPLAY.some((p) => (p.endsWith('/') ? file.startsWith(p) : file === p))
  if (!display && (inLicensing || inToken || LICENSING_CONTEXT.test(source))) {
    const tiered = source.replace(TIER_INDEX, (s) => '.tier'.padEnd(s.length))
    for (const m of tiered.matchAll(TIER_BRANCH)) add('tier-branch', m.index)
    const aliases = new Set(
      [...tiered.matchAll(TIER_ALIAS), ...tiered.matchAll(TIER_VAR)].map((m) => m[1]!),
    )
    aliases.delete('tier')
    for (const alias of aliases)
      for (const m of tiered.matchAll(aliasBranch(alias))) add('tier-branch', m.index)
  }

  if (inLicensing || inToken) {
    const own = inLicensing ? LICENSING : TOKEN_PKG
    const allowed = (spec: string, typeOnly: boolean) => {
      if (LICENSING_IMPORTS.has(spec)) return true
      if (!spec.startsWith('./') && !spec.startsWith('../')) return false
      const target = resolveSpecifier(file, spec)
      if (`${target}/`.startsWith(own)) return true
      return inLicensing && typeOnly && LICENSING_TYPE_IMPORTS.has(target)
    }
    for (const m of source.matchAll(STATIC_IMPORT))
      if (!allowed(m[3]!, Boolean(m[2]))) add('licensing-imports', m.index)
    for (const m of source.matchAll(DYNAMIC_IMPORT))
      if (!m[2]!.includes('${') && !allowed(m[2]!, false)) add('licensing-imports', m.index)
    for (const m of source.matchAll(COMPUTED_IMPORT)) add('licensing-imports', m.index)
    for (const m of blankStrings(source).matchAll(NETWORK_CALL)) add('licensing-network', m.index)
    for (const m of source.matchAll(NETWORK_INDEX)) add('licensing-network', m.index)
  }
  return out
}

/** Whether scanRepo parses a file it has read: always under licensing, otherwise only past the TRIGGER pre-filter. */
export function needsScan(file: string, source: string): boolean {
  return file.startsWith(LICENSING) || file.startsWith(TOKEN_PKG) || TRIGGER.test(source)
}

const SKIP = new Set(['node_modules', 'dist', 'tests', '__tests__', 'fixtures'])
function walk(dir: string, out: string[]): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (/\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/.test(e.name) && !/\.(?:test|spec)\./.test(e.name))
      out.push(full)
  }
  return out
}

export interface ScanResult {
  violations: BypassViolation[]
  /** Every application source file read, as a repo path. */
  read: string[]
  /** The files among them that were parsed (needsScan). */
  scanned: string[]
}

export function scanTree(root = REPO_ROOT): ScanResult {
  const result: ScanResult = { violations: [], read: [], scanned: [] }
  for (const top of SCAN_ROOTS) {
    const base = join(root, top)
    if (!existsSync(base)) continue
    for (const name of readdirSync(base)) {
      const src = join(base, name, 'src')
      if (!existsSync(src) || !statSync(src).isDirectory()) continue
      for (const full of walk(src, [])) {
        const file = relative(root, full).split('\\').join('/')
        const source = readFileSync(full, 'utf8')
        result.read.push(file)
        if (!needsScan(file, source)) continue
        result.scanned.push(file)
        result.violations.push(...findBypassViolations(file, source))
      }
    }
  }
  return result
}

export function scanRepo(root = REPO_ROOT): BypassViolation[] {
  return scanTree(root).violations
}

/**
 * Why a scan cannot be trusted to have looked: config.ts reads
 * OPENSTEWARD_LICENSE, so it passes any working pre-filter, and both licensing
 * directories always hold source. Empty means the scan reached all three.
 */
export function reachProblems(result: ScanResult): string[] {
  const problems: string[] = []
  if (!result.scanned.includes(LICENSE_ENV_READER))
    problems.push(
      `${LICENSE_ENV_READER} was not scanned: it reads OPENSTEWARD_LICENSE, so the walk or the pre-filter is broken`,
    )
  for (const dir of [LICENSING, TOKEN_PKG])
    if (!result.scanned.some((f) => f.startsWith(dir)))
      problems.push(`no file under ${dir} was scanned: the directory moved, or the walk is broken`)
  return problems
}

function main(): void {
  const soft = process.argv.includes('--soft')
  const result = scanTree()
  const reach = reachProblems(result)
  if (reach.length > 0) {
    console.error(
      `✖ the license bypass scan did not reach the code it guards (${result.read.length} files read):`,
    )
    for (const p of reach) console.error(`  - ${p}`)
    // A scan that read nothing proves nothing, so --soft does not soften this.
    process.exitCode = 1
    return
  }
  const { violations } = result
  if (violations.length > 0) {
    console.error(`✖ ${violations.length} license bypass finding(s):`)
    for (const v of violations) console.error(`  - ${v.file}:${v.line} [${v.rule}] ${v.snippet}`)
    console.error(
      '\nThe license check has no off switch. Every decision goes through LicenseManager/EntitlementService, ' +
        'gated on features and limits (never tier), and licensing reads no environment and makes no network call.',
    )
    if (!soft) process.exitCode = 1
    return
  }
  console.log(
    '✓ No license off switch, side door, tier branch, network call or dev-key leak in application source ' +
      `(${result.read.length} files read, ${result.scanned.length} scanned).`,
  )
}
const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) main()
