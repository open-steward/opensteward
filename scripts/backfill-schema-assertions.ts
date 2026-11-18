/**
 * Codemod: append a schema-validity assertion to nested-layout transform
 * tests (`unit/adapters/<slug>/transform/<resource>.test.ts`) that lack one.
 * Intended for one-shot use per file; remove when
 * `transform-schema-assertion-baseline.json` is empty.
 *
 * Scope: nested-layout files ONLY. Flat-layout files
 * (`unit/adapters/<slug>-transform.test.ts` / `<slug>.test.ts`) hold many
 * resources per file, one `describe` each, and need one assertion per
 * resource — a different transformation this codemod deliberately does not
 * attempt. See `docs/architecture/transform-conformance.md` for the known
 * conformance caveats around the guard and the remaining baseline.
 *
 * Strategy: parse each candidate file with the TypeScript compiler API and
 * find a real, already-present invocation of the resource's `transform*`
 * function whose arguments only reference names resolvable at the point
 * we're inserting — either module-scope declarations/imports, or local
 * `const` fixtures we duplicate verbatim into the new block. This is
 * deliberately more careful than "grab the first `const result = transformX(`
 * line": that naive approach reuses identifiers (e.g. a `raw` declared
 * inside one `it()`) that are out of scope in a freshly appended sibling
 * `it()`, producing code that doesn't compile. Anything that doesn't resolve
 * cleanly is skipped and reported, never guessed at.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, basename, dirname } from 'node:path'
import ts from 'typescript'

const REPO_ROOT = join(import.meta.dirname, '..')
const TESTS_ROOT = join(REPO_ROOT, 'apps/integration-server/tests/verticals')
const SRC_ROOT = join(REPO_ROOT, 'apps/integration-server/src/verticals')

const apply = process.argv.includes('--apply')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity
const verticalArg = process.argv.find((a) => a.startsWith('--vertical='))
const verticalFilter = verticalArg ? verticalArg.split('=')[1] : null
// --only=<path>, relative to TESTS_ROOT — e.g. `accounting`,
// `accounting/unit/adapters/abacus`, or a single test file's relative path.
// Matches by path-segment prefix so `--only=accounting` doesn't also match
// `accounting-foo` if such a vertical ever existed. Re-adding a schema
// assertion to one already-fixed adapter without touching the rest of a
// large, still-baselined corpus needs this — --vertical= alone can't narrow
// past a whole vertical, and --limit= narrows by count, not by path.
const onlyArg = process.argv.find((a) => a.startsWith('--only='))
const onlyFilter = onlyArg ? onlyArg.split('=').slice(1).join('=') : null

const norm = (s: string) => s.replace(/[-_]/g, '').toLowerCase()

/** Any nested-layout `.test.ts` file under a vertical's `unit/adapters/**\/transform/` tree. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.includes('/transform/') && full.endsWith('.test.ts')) out.push(full)
  }
  return out
}

const IMPORTS_TRANSFORM = /from\s+['"][^'"]*\/transform\/[^'"]*['"]/
const HAS_SCHEMA_ASSERTION = /\w+Schema\s*\.\s*(?:safeParse|parse)\s*\(/

/** Pick the export whose name, minus the Schema suffix, equals the resource (dash/underscore-insensitive). */
function schemaExportFor(vertical: string, resource: string): string | null {
  const schemaPath = join(SRC_ROOT, vertical, 'schema', `${resource}.ts`)
  let src: string
  try {
    src = readFileSync(schemaPath, 'utf8')
  } catch {
    return null
  }
  const names = [...src.matchAll(/export const ([A-Za-z0-9]+Schema)\b/g)].map((m) => m[1])
  return names.find((n) => norm(n.slice(0, -'Schema'.length)) === norm(resource)) ?? null
}

const GLOBALS = new Set([
  'undefined',
  'null',
  'true',
  'false',
  'NaN',
  'Infinity',
  'Date',
  'Array',
  'Object',
  'Math',
  'String',
  'Number',
  'Boolean',
  'RegExp',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Promise',
  'Symbol',
  'JSON',
  'console',
  'Buffer',
  'Error',
  'TypeError',
  'RangeError',
  'Uint8Array',
  'Int8Array',
  'Uint8ClampedArray',
  'structuredClone',
  'globalThis',
])

/** Collect free (unbound) value-identifier references within an expression subtree. */
function collectFreeIdentifiers(node: ts.Node, out: Set<string>): void {
  if (ts.isTypeNode(node)) return
  if (ts.isIdentifier(node)) {
    out.add(node.text)
    return
  }
  if (ts.isPropertyAccessExpression(node)) {
    collectFreeIdentifiers(node.expression, out)
    return
  }
  if (ts.isElementAccessExpression(node)) {
    collectFreeIdentifiers(node.expression, out)
    collectFreeIdentifiers(node.argumentExpression, out)
    return
  }
  if (ts.isPropertyAssignment(node)) {
    if (ts.isComputedPropertyName(node.name)) collectFreeIdentifiers(node.name.expression, out)
    collectFreeIdentifiers(node.initializer, out)
    return
  }
  if (ts.isShorthandPropertyAssignment(node)) {
    out.add(node.name.text)
    return
  }
  node.forEachChild((child) => collectFreeIdentifiers(child, out))
}

/** Enclosing Block/SourceFile containers, innermost first — the lexical scope chain. */
function enclosingContainers(node: ts.Node): (ts.SourceFile | ts.Block)[] {
  const out: (ts.SourceFile | ts.Block)[] = []
  let cur: ts.Node | undefined = node
  while (cur) {
    if (ts.isBlock(cur) || ts.isSourceFile(cur)) out.push(cur)
    cur = cur.parent
  }
  return out
}

/** const/let/var declarations directly in a container's statement list (name -> initializer). */
function frameNames(container: ts.SourceFile | ts.Block): Map<string, ts.Expression | undefined> {
  const out = new Map<string, ts.Expression | undefined>()
  for (const stmt of container.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) out.set(decl.name.text, decl.initializer)
      }
    } else if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      out.set(stmt.name.text, undefined) // present but not text-inlinable; resolution fails on it
    }
  }
  return out
}

/**
 * Try to make `freeNames` (referenced from `siteNode`'s position) fully
 * resolvable at `insertionContainers` — the scope chain of the block the new
 * `it()` will actually be inserted into.
 *
 * Two ways a name resolves, tried in this order:
 *   1. It's already visible at the insertion point (module scope, or a
 *      `const` declared directly in the insertion block or one of its
 *      ancestors) — reuse it by reference, no duplication.
 *   2. It's declared somewhere in the *call site's own* scope chain (e.g. a
 *      fixture built inside one specific `it()`) but not visible at the
 *      insertion point — duplicate that declaration's initializer text
 *      (recursively) into the new block instead.
 *
 * Preferring (1) matters: duplicating a fixture the insertion point could
 * already see just shadows the original with a re-declaration that has
 * silently dropped its type annotation (`const raw: FADebtor = {...}`
 * becomes an untyped `const raw = {...}`) — invisible today because
 * `tests/**` isn't in any tsconfig's `include`.
 */
function resolveFreeNames(
  freeNames: Set<string>,
  siteNode: ts.Node,
  insertionContainers: (ts.SourceFile | ts.Block)[],
  sf: ts.SourceFile,
  moduleScopeNames: Set<string>,
): string[] | null {
  const callSiteContainers = enclosingContainers(siteNode)
  const insertionSet = new Set<ts.Node>(insertionContainers)
  const declLines: string[] = []
  const resolved = new Set<string>(moduleScopeNames)
  const inProgress = new Set<string>()

  function resolveName(name: string, depth: number): boolean {
    if (resolved.has(name) || GLOBALS.has(name)) return true
    if (inProgress.has(name)) return false
    if (depth > 4) return false
    inProgress.add(name)

    // (1) Already visible at the insertion point — no duplication needed.
    for (const c of insertionContainers) {
      if (frameNames(c).has(name)) {
        resolved.add(name)
        return true
      }
    }

    // (2) Duplicate a declaration from the call site's own scope chain,
    // skipping any container also reachable from the insertion point (would
    // have matched above already — this only reaches containers strictly
    // *inside* the insertion scope, e.g. a sibling `it()`'s local fixture).
    for (const c of callSiteContainers) {
      if (insertionSet.has(c)) continue
      const frame = frameNames(c)
      if (!frame.has(name)) continue
      const init = frame.get(name)
      if (init === undefined) return false // function decl or destructured — not text-inlinable
      const innerFree = new Set<string>()
      collectFreeIdentifiers(init, innerFree)
      for (const inner of innerFree) {
        if (inner === name) continue
        if (!resolveName(inner, depth + 1)) return false
      }
      declLines.push(`const ${name} = ${init.getText(sf)}`)
      resolved.add(name)
      return true
    }
    return false
  }

  for (const name of freeNames) {
    if (!resolveName(name, 0)) return null
  }
  return declLines
}

interface Candidate {
  callText: string
  declLines: string[]
  describeBlock: ts.Block | null
}

/**
 * The outermost `describe(...)` callback Block enclosing `node` — i.e. keep
 * walking past nested sub-describes (`describe('id coercion', () => ...)`
 * inside `describe('transformContact', () => ...)`) to the top-level one for
 * this transform. A whole-object schema assertion is a peer of the other
 * top-level cases, not a peer of one narrow field-level sub-suite; inserting
 * into the innermost enclosing describe nests it under an arbitrary label.
 * Distinct top-level *sibling* describes (one call each) are unaffected:
 * with no nesting, outermost === innermost.
 */
function enclosingDescribeBlock(node: ts.Node): ts.Block | null {
  let cur: ts.Node | undefined = node
  let found: ts.Block | null = null
  while (cur) {
    if (ts.isBlock(cur)) {
      const fn = cur.parent
      if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
        const call = fn.parent
        if (
          call &&
          ts.isCallExpression(call) &&
          ts.isIdentifier(call.expression) &&
          call.expression.text === 'describe'
        ) {
          found = cur // overwritten on every match — last write wins, i.e. outermost
        }
      }
    }
    cur = cur.parent
  }
  return found
}

/** Find a reusable call to one of `fnNames`, trying each in encounter order. */
function findReusableCall(
  sf: ts.SourceFile,
  fnNames: string[],
  moduleScopeNames: Set<string>,
): Candidate | null {
  const calls: ts.CallExpression[] = []
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      fnNames.includes(node.expression.text)
    ) {
      calls.push(node)
    }
    node.forEachChild(visit)
  }
  visit(sf)
  calls.sort((a, b) => a.pos - b.pos)

  for (const fnName of fnNames) {
    for (const call of calls) {
      if (!ts.isIdentifier(call.expression) || call.expression.text !== fnName) continue
      const describeBlock = enclosingDescribeBlock(call)
      const insertionContainers = describeBlock ? enclosingContainers(describeBlock) : [sf]
      const free = new Set<string>()
      for (const arg of call.arguments) collectFreeIdentifiers(arg, free)
      const declLines = resolveFreeNames(free, call, insertionContainers, sf, moduleScopeNames)
      if (declLines === null) continue
      return { callText: call.getText(sf), declLines, describeBlock }
    }
  }
  return null
}

/** Module-scope (top-level) names: imports, top-level const/let/var, top-level function decls. */
function moduleScopeNamesOf(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>()
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && stmt.importClause) {
      const clause = stmt.importClause
      if (clause.name) names.add(clause.name.text)
      if (clause.namedBindings) {
        if (ts.isNamedImports(clause.namedBindings)) {
          for (const el of clause.namedBindings.elements) names.add(el.name.text)
        } else if (ts.isNamespaceImport(clause.namedBindings)) {
          names.add(clause.namedBindings.name.text)
        }
      }
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) names.add(decl.name.text)
      }
    } else if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      names.add(stmt.name.text)
    }
  }
  return names
}

/** transform* names imported specifically from the module for this resource. */
function transformImportsFor(sf: ts.SourceFile, resource: string): string[] {
  const names: string[] = []
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.importClause) continue
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue
    const spec = stmt.moduleSpecifier.text.replace(/\.(ts|js)$/, '')
    if (!spec.endsWith(`/transform/${resource}`)) continue
    const clause = stmt.importClause
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) {
        if (el.isTypeOnly) continue
        if (el.name.text.startsWith('transform')) names.push(el.name.text)
      }
    }
  }
  return names
}

const skipped: Array<{ file: string; why: string }> = []
let changed = 0

const allFiles = walk(TESTS_ROOT).sort()
const files = allFiles.filter((f) => {
  if (verticalFilter && relative(REPO_ROOT, f).split('/')[4] !== verticalFilter) return false
  if (onlyFilter) {
    const relFromTestsRoot = relative(TESTS_ROOT, f)
    if (relFromTestsRoot !== onlyFilter && !relFromTestsRoot.startsWith(onlyFilter + '/'))
      return false
  }
  const src = readFileSync(f, 'utf8')
  return IMPORTS_TRANSFORM.test(src) && !HAS_SCHEMA_ASSERTION.test(src)
})

for (const file of files) {
  if (changed >= limit) break
  const src = readFileSync(file, 'utf8')

  const rel = relative(REPO_ROOT, file)
  const resource = basename(file, '.test.ts')
  const parts = rel.split('/')
  const vertical = parts[4] // apps/integration-server/tests/verticals/<vertical>/...

  const schemaExport = schemaExportFor(vertical, resource)
  if (!schemaExport) {
    skipped.push({
      file: rel,
      why: `no <X>Schema export in ${vertical}/schema/${resource}.ts matching resource name`,
    })
    continue
  }

  const sf = ts.createSourceFile(
    file,
    src,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  )

  const fnNames = transformImportsFor(sf, resource)
  if (fnNames.length === 0) {
    skipped.push({ file: rel, why: `no transform* value import from .../transform/${resource}` })
    continue
  }

  const moduleScopeNames = moduleScopeNamesOf(sf)
  const found = findReusableCall(sf, fnNames, moduleScopeNames)
  if (!found) {
    skipped.push({
      file: rel,
      why: `no reusable call found for ${fnNames.join(', ')} (all call sites reference names that don't resolve)`,
    })
    continue
  }

  // Insert the new assertion into the outermost describe block that actually
  // contains the reused call — not blindly the last describe in the file —
  // so a multi-describe file (e.g. one `describe` per raw variant/direction,
  // or a top-level describe with narrow field-level sub-describes) doesn't
  // end up with the new test nested under an unrelated or overly-narrow label.
  const describeBlock = found.describeBlock

  const alreadyImported = moduleScopeNames.has(schemaExport)
  let importInsertText = ''
  if (!alreadyImported) {
    const schemaPath = join(SRC_ROOT, vertical, 'schema', resource)
    let importPath = relative(dirname(file), schemaPath).split('\\').join('/')
    if (!importPath.startsWith('.')) importPath = './' + importPath
    importInsertText = `import { ${schemaExport} } from '${importPath}'\n`
  }

  const bodyLines = [...found.declLines, `const result = ${found.callText}`]
  const block =
    `\n  it('produces canonical output that satisfies the schema', () => {\n` +
    bodyLines.map((l) => `    ${l}`).join('\n') +
    `\n    expect(() => ${schemaExport}.parse(result)).not.toThrow()\n` +
    `  })\n`

  const firstImportEnd = src.indexOf('\n', src.indexOf('import '))
  const withImport =
    src.slice(0, firstImportEnd + 1) + importInsertText + src.slice(firstImportEnd + 1)
  const shift = importInsertText.length

  // Offset of the insertion point (just before the closing `}` of the target
  // block) computed from the original AST position, then shifted by however
  // much text the import insertion added ahead of it.
  const rawOffset = describeBlock ? describeBlock.getEnd() - 1 : src.lastIndexOf('})')
  if (rawOffset < 0) {
    skipped.push({ file: rel, why: 'no closing describe block found' })
    continue
  }
  const offset = rawOffset + shift
  const out = withImport.slice(0, offset) + block + withImport.slice(offset)

  if (apply) writeFileSync(file, out)
  changed++
}

console.log(`${apply ? 'Rewrote' : 'Would rewrite'} ${changed} file(s).`)
console.log(`Skipped ${skipped.length} file(s).`)
for (const s of skipped.slice(0, 60)) console.log(`  ${s.file}: ${s.why}`)
if (skipped.length > 60) console.log(`  ... and ${skipped.length - 60} more`)
