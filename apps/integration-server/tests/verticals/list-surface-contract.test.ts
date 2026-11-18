import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

/**
 * The class guard for the whole list surface.
 *
 * Handover 5 put it plainly: every finding describes a CLASS, and the endpoint
 * it cites is an example rather than the scope. This project has now watched
 * that play out three times — FK integrity fixed for contacts but not
 * accounts; a timeout budget fixed at one endpoint and not as a budget;
 * `hasMore` added to the one endpoint a finding named.
 *
 * A per-endpoint assertion cannot catch that, by construction: it passes on
 * the endpoint someone remembered to fix. This walks every list route in every
 * vertical instead, so a new router that skips the envelope fails here on the
 * day it is written rather than in a review round months later.
 *
 * It is a source-level check on purpose. The alternative — booting all nine
 * verticals against 1,545 adapters — is exactly the kind of test nobody runs.
 */

const SRC_DIR = join(__dirname, '../../src')
const VERTICALS_DIR = join(SRC_DIR, 'verticals')

const VERTICALS = readdirSync(VERTICALS_DIR).filter(
  (d) => d !== 'shared' && existsSync(join(VERTICALS_DIR, d, 'router')),
)

interface RouteFile {
  vertical: string
  file: string
  path: string
  src: string
}

function routerFiles(): RouteFile[] {
  const out: RouteFile[] = []
  for (const vertical of VERTICALS) {
    const dir = join(VERTICALS_DIR, vertical, 'router')
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'helpers.ts')) {
      const path = join(dir, file)
      out.push({ vertical, file, path, src: readFileSync(path, 'utf8') })
    }
  }
  return out
}

const FILES = routerFiles()
const LIST_FILES = FILES.filter((f) => /\bcachedList\s*[<(]/.test(f.src))

describe('every vertical is covered by this test', () => {
  it('finds all nine verticals', () => {
    expect(VERTICALS.length).toBe(9)
  })

  it('finds list routers across more than one vertical', () => {
    // Guards the guard: if the discovery above silently matched nothing, every
    // assertion below would pass vacuously.
    const covered = new Set(LIST_FILES.map((f) => f.vertical))
    expect(covered.size).toBe(9)
    expect(LIST_FILES.length).toBeGreaterThan(50)
  })
})

describe('every list route returns the documented envelope', () => {
  it('no list route answers with a bare { data }', () => {
    // `ListMeta` is described in every vertical's OpenAPI as "returned
    // alongside every /v1/* list response". Eight verticals returned bare
    // `{ data }`, so the published contract was untrue for 59 endpoints.
    const offenders = LIST_FILES.filter((f) => /return reply\.send\(\{ data \}\)/.test(f.src)).map(
      (f) => `${f.vertical}/${f.file}`,
    )
    expect(offenders).toEqual([])
  })

  it('every list route builds its response with listPage', () => {
    const offenders = LIST_FILES.filter((f) => !/\blistPage\s*\(/.test(f.src)).map(
      (f) => `${f.vertical}/${f.file}`,
    )
    expect(offenders).toEqual([])
  })
})

describe('every list route parses its query instead of forwarding it raw', () => {
  it('no list route passes request.query straight to an adapter', () => {
    // Raw forwarding delivered `limit` and `page` as STRINGS and never
    // delivered `updated_after` at all — adapters read `params.updatedAfter`,
    // the query carries `updated_after`. 170 adapters across seven verticals
    // contain incremental-sync code that had never once received a value.
    const offenders = LIST_FILES.filter((f) =>
      /fetch:[\s\S]{0,200}?request\.query as Record<string, unknown>/.test(f.src),
    ).map((f) => `${f.vertical}/${f.file}`)
    expect(offenders).toEqual([])
  })

  it('every list route calls parseListQuery', () => {
    const offenders = LIST_FILES.filter((f) => !/\bparseListQuery\s*\(/.test(f.src)).map(
      (f) => `${f.vertical}/${f.file}`,
    )
    expect(offenders).toEqual([])
  })
})

/**
 * Every reference to `parseListQuery` or `listPage` anywhere under `src/`,
 * read from the TypeScript AST rather than matched as text.
 *
 * The whole tree, not only `src/verticals/<v>/router/*.ts`: a list route in a
 * nested directory or mounted from elsewhere is still a list route. The AST
 * because every other way of reaching the function is a way past a text scan
 * — an aliased import (`parseListQuery as parse`), `parseListQuery.call(…)`,
 * `(0, parseListQuery)(…)`, a namespace import — and comments and strings that
 * merely mention it are not calls. A reference that is neither a direct call
 * nor a plain import/re-export is reported rather than guessed at.
 *
 * `listPage` is only counted, as the reference for how many list responses a
 * file builds: direct calls of the imported function. Adapters have methods
 * of the same name (`client.listPage(…)`), which are not it.
 */
interface Call {
  file: string
  where: string
  args: string[]
}

function tsFilesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...tsFilesUnder(path))
    else if (entry.name.endsWith('.ts')) out.push(path)
  }
  return out
}

function scanCalls(name: string, strict: boolean): { calls: Call[]; indirect: string[] } {
  const calls: Call[] = []
  const indirect: string[] = []
  for (const path of tsFilesUnder(SRC_DIR)) {
    const text = readFileSync(path, 'utf8')
    if (!text.includes(name)) continue
    const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
    const file = relative(SRC_DIR, path)
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && node.text === name) {
        const where = `${file}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`
        const parent = node.parent
        // `parseListQuery(…)`, or `shared.parseListQuery(…)` off a namespace.
        const callee =
          strict && ts.isPropertyAccessExpression(parent) && parent.name === node ? parent : node
        const call = callee.parent
        if (ts.isCallExpression(call) && call.expression === callee) {
          calls.push({ file, where, args: call.arguments.map((a) => a.getText(sf)) })
        } else if (
          !strict ||
          ((ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) &&
            parent.propertyName === undefined)
        ) {
          // A plain `import { parseListQuery }` or re-export: not a use.
        } else {
          indirect.push(`${where} ${parent.getText(sf)}`)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return { calls, indirect }
}

const countBy = (calls: Call[]): Map<string, number> => {
  const out = new Map<string, number>()
  for (const c of calls) out.set(c.file, (out.get(c.file) ?? 0) + 1)
  return out
}

describe('every list route caps its limit at the platform’s page maximum', () => {
  const PARSE = scanCalls('parseListQuery', true)
  const PAGE = scanCalls('listPage', false)

  it('finds the calls to check, one parse per list response', () => {
    // Guards the guard: a scan that matched nothing would pass below. Every
    // list handler parses its query once and builds its response once, so
    // the two counts match file by file — a parse that escaped the scan
    // (an alias, `.call`) leaves its file one short.
    expect(PARSE.calls.length).toBeGreaterThan(70)
    expect(new Set(PARSE.calls.map((c) => c.file.split('/')[1])).size).toBe(9)
    expect(Object.fromEntries(countBy(PARSE.calls))).toEqual(
      Object.fromEntries(countBy(PAGE.calls)),
    )
  })

  it('every parseListQuery call passes the adapter', () => {
    // Without the adapter, `limit` defaults to 100 however small the
    // platform's page is. An adapter that clamps to its maximum (paysafe: 50)
    // then returns a "short" page: `meta.hasMore` says false and the cache
    // stores those rows as the whole collection. `capabilities.maxPageSize`
    // only reaches the router through this argument.
    const offenders = PARSE.calls
      .filter((c) => c.args.length !== 2 || !/^(request\.)?adapter$/.test(c.args[1]!))
      .map((c) => `${c.where} parseListQuery(${c.args.join(', ')})`)
    expect(offenders).toEqual([])
  })

  it('parseListQuery is only ever called directly', () => {
    // An alias or an indirect call is a call this scan cannot check.
    expect(PARSE.indirect).toEqual([])
  })
})

describe('every list route protects the cache from partial pages', () => {
  it('passes isComplete so a filtered page cannot become the cached collection', () => {
    // Without it, `?limit=2` writes two rows that a later unfiltered read
    // serves as the whole collection — a silent truncation, persisted, and
    // visible to every consumer of that connection.
    const offenders = LIST_FILES.filter((f) => !/\bisComplete\s*:/.test(f.src)).map(
      (f) => `${f.vertical}/${f.file}`,
    )
    expect(offenders).toEqual([])
  })
})

describe('there is one envelope implementation, not one per vertical', () => {
  it('no vertical hand-rolls its own listPage', () => {
    // The single-implementation rule is the actual fix. Accounting owning a
    // private copy is what let the two halves of the surface drift apart for
    // as long as they did.
    const offenders = FILES.filter((f) => /^export function listPage/m.test(f.src)).map(
      (f) => `${f.vertical}/${f.file}`,
    )
    expect(offenders).toEqual([])
  })
})
