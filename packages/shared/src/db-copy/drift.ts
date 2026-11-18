/**
 * Source scanning for each service's "the db-copy profile opens what
 * server.ts opens" test.
 *
 * `callsReceiving(src, 'credHandle')` lists every call that is handed the
 * handle as an argument — positionally (`X.create(credHandle, …)`), in an
 * object literal (`X.create({ handle: credHandle })`), as a shorthand
 * property (`X.create({ credHandle })`) or to a constructor
 * (`new X(credHandle)`). Declarations, assignments, conditions, calls ON the
 * handle (`credHandle.close()`), comments and strings are not calls that
 * receive it. The tests compare the result with the profile's own
 * `X.create(handle …)` calls plus an explicit, reasoned exclusion list, so a
 * store added to server.ts in any of these shapes fails until it is
 * classified.
 */

const KEYWORDS = new Set(['if', 'while', 'for', 'switch', 'return', 'catch', 'await', 'typeof'])

/** Blank out comments and string/template contents; offsets are kept. */
export function blankCommentsAndStrings(src: string): string {
  const out = src.split('')
  let i = 0
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== '\n') out[k] = ' '
  }
  while (i < src.length) {
    const c = src[i]!
    const next = src[i + 1]
    if (c === '/' && next === '/') {
      const end = src.indexOf('\n', i)
      const stop = end === -1 ? src.length : end
      blank(i, stop)
      i = stop
    } else if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end === -1 ? src.length : end + 2
      blank(i, stop)
      i = stop
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1
      blank(i, j + 1)
      i = j + 1
    } else {
      i++
    }
  }
  return out.join('')
}

/**
 * A `(` that opens a parameter list rather than a call: its `)` is followed
 * by `=>`, a function body `{`, or a return-type annotation `:`.
 */
function isParameterList(s: string, open: number): boolean {
  let depth = 0
  for (let j = open; j < s.length; j++) {
    if (s[j] === '(') depth++
    else if (s[j] === ')' && --depth === 0) {
      return /^\s*(=>|\{|:)/.test(s.slice(j + 1))
    }
  }
  return false
}

/** The callee of the innermost call whose argument list contains `pos`, if any. */
function enclosingCallee(s: string, pos: number): string | undefined {
  let paren = 0
  let brace = 0
  let bracket = 0
  for (let i = pos - 1; i >= 0; i--) {
    const c = s[i]
    if (c === ')') paren++
    else if (c === ']') bracket++
    else if (c === '}') brace++
    else if (c === '[') {
      if (bracket > 0) bracket--
    } else if (c === '{') {
      if (brace > 0) {
        brace--
        continue
      }
      // An unmatched `{`: an object literal if it follows `(`, `,`, `:`, `=`
      // or `[`; otherwise a block, and the identifier is not an argument.
      const before = s.slice(0, i).trimEnd()
      if (!/[(,:=[]$/.test(before)) return undefined
    } else if (c === '(') {
      if (paren > 0) {
        paren--
        continue
      }
      if (isParameterList(s, i)) return undefined
      const m = /(?:\bnew\s+)?([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*$/.exec(
        s.slice(0, i),
      )
      if (!m) return undefined
      const callee = m[1]!.replace(/\s+/g, '')
      return KEYWORDS.has(callee) ? undefined : callee
    }
  }
  return undefined
}

/**
 * Names of the calls handed `identifier`, `.create` dropped (`CredentialStore`
 * for `CredentialStore.create(credHandle)`), sorted and de-duplicated.
 */
export function callsReceiving(src: string, identifier: string): string[] {
  const s = blankCommentsAndStrings(src)
  const found = new Set<string>()
  const re = new RegExp(`(?<![\\w$.])${identifier.replace(/[$]/g, '\\$')}(?![\\w$])`, 'g')
  for (let m = re.exec(s); m; m = re.exec(s)) {
    const after = s.slice(m.index + identifier.length).trimStart()
    // A call on the handle, an assignment to it, or an object key / type
    // annotation named like it — not an argument.
    if (after.startsWith('.') || /^=(?!=)/.test(after) || /^:(?!:)/.test(after)) continue
    if (/\b(?:const|let|var)\s+$/.test(s.slice(0, m.index))) continue
    const callee = enclosingCallee(s, m.index)
    if (callee) found.add(callee.replace(/\.create$/, ''))
  }
  return [...found].sort()
}
