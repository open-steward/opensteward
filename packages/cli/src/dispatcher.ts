/**
 * `dispatcher` — the only hand-written runtime entry point of the CLI.
 *
 * Builds a commander program, loads every generated tag module from
 * `./generated/`, registers each `CommandDescriptor` as a nested
 * subcommand, registers the static offline tools, and dispatches.
 *
 * The dispatcher is intentionally thin (~50 LOC of orchestration after
 * the rendering helpers). All routing knowledge — paths, params, body
 * shape, response renderer — lives in the descriptors emitted by
 * `scripts/generate-commands.ts`.
 */

import { Command, Option } from 'commander'
import Table from 'cli-table3'
import { JSONPath } from 'jsonpath-plus'
import { resolveAuth } from './auth.js'
import { makeClient } from './client.js'
import { registerOfflineTools } from './offline-tools.js'
import { registerSetup } from './setup.js'

// ── Shared descriptor types ─────────────────────────────────────────

export interface PathArgDescriptor {
  name: string
  sourceName: string
  description: string
  required: boolean
}

export interface FlagDescriptor {
  name: string
  sourceName: string
  location:
    | 'query'
    | 'body'
    | 'body-nested'
    | 'body-json'
    | 'header'
    | 'body-discriminator'
    | 'body-discriminated'
  bodyPath: string[]
  flagTemplate: string
  description: string
  required: boolean
  coerce: 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'json'
  choices: string[]
  /**
   * Dotted body-path to the discriminator property (only set on
   * `body-discriminator` and `body-discriminated` flags). Used by the
   * runtime to wire the discriminator value into the right slot.
   */
  discriminatorPath?: string[]
  /**
   * Branch literal this per-branch flag belongs to (only set on
   * `body-discriminated`). Runtime ignores the flag if the chosen
   * branch differs.
   */
  discriminatorValue?: string
  /**
   * Name of the selector flag this branch flag is gated on (only set
   * on `body-discriminated`).
   */
  discriminatorFlag?: string
}

export interface CommandDescriptor {
  /** ['users', 'create'] etc. */
  commandPath: string[]
  operationId: string
  spec: 'admin' | 'public'
  /** Public-spec only: prefix the wire path with `/v1` (see generator note). */
  versioned?: boolean
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  pathTemplate: string
  summary: string
  description: string
  pathArgs: PathArgDescriptor[]
  flags: FlagDescriptor[]
  renderer: 'table' | 'object' | 'primitive' | 'unknown'
  tableColumns: string[]
  responseUnwrap: string[]
}

// ── Globals (set once when the program is built) ────────────────────

interface DispatcherGlobals {
  baseUrl?: string
  test: boolean
  json: boolean
  quiet: boolean
  noColor: boolean
  jsonpath?: string
  token?: string
}

let globals: DispatcherGlobals = { test: false, json: false, quiet: false, noColor: false }

// ── Renderers ───────────────────────────────────────────────────────

function unwrap(value: unknown, path: string[]): unknown {
  let cur: unknown = value
  for (const k of path) {
    if (cur != null && typeof cur === 'object' && k in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[k]
    } else {
      return value
    }
  }
  return cur
}

function renderTable(rows: unknown[], columns: string[]): string {
  if (rows.length === 0) return '(no results)\n'
  // If columns are empty (couldn't be inferred at gen time), pick the
  // primitive top-level keys of the first object as columns.
  let cols = columns
  if (cols.length === 0) {
    const first = rows[0]
    if (first && typeof first === 'object') {
      cols = Object.keys(first as Record<string, unknown>)
        .filter((k) => {
          const v = (first as Record<string, unknown>)[k]
          const t = typeof v
          return v == null || t === 'string' || t === 'number' || t === 'boolean'
        })
        .slice(0, 6)
    }
  }
  const table = new Table({ head: cols })
  for (const r of rows) {
    if (!r || typeof r !== 'object') {
      table.push([String(r)])
      continue
    }
    table.push(cols.map((c) => formatCell((r as Record<string, unknown>)[c])))
  }
  return table.toString() + '\n'
}

function formatCell(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  // For non-primitives, stringify compactly.
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function renderObject(obj: unknown): string {
  if (obj == null) return '(null)\n'
  if (typeof obj !== 'object') return String(obj) + '\n'
  const lines: string[] = []
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v != null && typeof v === 'object') {
      lines.push(`${k}: ${JSON.stringify(v)}`)
    } else {
      lines.push(`${k}: ${v == null ? '' : String(v)}`)
    }
  }
  return lines.join('\n') + '\n'
}

function renderResponse(cmd: CommandDescriptor, data: unknown): string {
  let value = unwrap(data, cmd.responseUnwrap ?? [])
  if (globals.jsonpath) {
    // JSONPath types require non-`unknown` json — cast and let runtime
    // handle any shape (the lib treats primitives as leaf matches).
    const result = JSONPath({
      path: globals.jsonpath,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      json: value as any,
    })
    value = result
  }
  if (globals.json) {
    return JSON.stringify(value, null, 2) + '\n'
  }
  switch (cmd.renderer) {
    case 'table':
      if (!Array.isArray(value)) return renderObject(value)
      return renderTable(value, cmd.tableColumns ?? [])
    case 'object':
      return renderObject(value)
    case 'primitive':
      return String(value) + '\n'
    case 'unknown':
    default:
      return JSON.stringify(value, null, 2) + '\n'
  }
}

// ── Body / query assembly ───────────────────────────────────────────

function setDeep(obj: Record<string, unknown>, path: string[], value: unknown): void {
  if (path.length === 0) return
  let cur: Record<string, unknown> = obj
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i]
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {}
    cur = cur[k] as Record<string, unknown>
  }
  cur[path[path.length - 1]] = value
}

function assembleRequest(
  cmd: CommandDescriptor,
  positional: string[],
  options: Record<string, unknown>,
): {
  pathParams: Record<string, string>
  queryParams: Record<string, unknown>
  body: unknown
} {
  const pathParams: Record<string, string> = {}
  cmd.pathArgs.forEach((arg, i) => {
    const val = positional[i]
    if (val === undefined && arg.required) {
      throw new Error(`missing required path argument: <${arg.name}>`)
    }
    if (val !== undefined) pathParams[arg.sourceName] = val
  })

  const queryParams: Record<string, unknown> = {}
  let body: Record<string, unknown> | unknown = undefined
  const bodyObj: Record<string, unknown> = {}
  let hasBody = false
  let rawBody: unknown = undefined

  // First pass — record which discriminator-selector each user picked
  // and warn if `--body-json` is mixed with per-branch flags.
  const chosenBranchByFlag = new Map<string, string>()
  let perBranchFlagsProvided = false
  for (const flag of cmd.flags) {
    const camel = camelize(flag.name)
    const provided = options[camel]
    if (provided === undefined) continue
    if (flag.location === 'body-discriminator' && typeof provided === 'string') {
      chosenBranchByFlag.set(flag.name, provided)
    }
    if (flag.location === 'body-discriminated') {
      perBranchFlagsProvided = true
    }
  }
  const bodyJsonProvided = cmd.flags.some(
    (f) => f.location === 'body-json' && options[camelize(f.name)] !== undefined,
  )
  if (bodyJsonProvided && perBranchFlagsProvided) {
    process.stderr.write(
      '[os] warning: --body-json supplied with per-branch flags; --body-json wins.\n',
    )
  }

  for (const flag of cmd.flags) {
    const camel = camelize(flag.name)
    const provided = options[camel]
    if (provided === undefined) continue
    if (flag.choices.length && typeof provided === 'string' && !flag.choices.includes(provided)) {
      throw new Error(
        `invalid value '${provided}' for --${flag.name}; expected one of: ${flag.choices.join(', ')}`,
      )
    }
    if (flag.location === 'query') {
      queryParams[flag.sourceName] = provided
    } else if (flag.location === 'body-json') {
      rawBody = provided
    } else if (flag.location === 'body-discriminator') {
      // Wire the discriminator literal into the body at its path.
      // The discriminatorPath is the same as bodyPath here.
      setDeep(bodyObj, flag.bodyPath, provided)
      hasBody = true
    } else if (flag.location === 'body-discriminated') {
      // Only apply if the user actually selected this branch.
      const chosen = flag.discriminatorFlag
        ? chosenBranchByFlag.get(flag.discriminatorFlag)
        : undefined
      if (chosen !== flag.discriminatorValue) continue
      setDeep(bodyObj, flag.bodyPath, provided)
      hasBody = true
    } else if (flag.location === 'body' && flag.bodyPath.length === 1) {
      bodyObj[flag.bodyPath[0]] = provided
      hasBody = true
    } else if (flag.location === 'body-nested' && flag.bodyPath.length === 2) {
      const [a, b] = flag.bodyPath
      if (!bodyObj[a] || typeof bodyObj[a] !== 'object') bodyObj[a] = {}
      ;(bodyObj[a] as Record<string, unknown>)[b] = provided
      hasBody = true
    } else if (flag.location === 'body') {
      // JSON fallback for an over-deep object.
      const [a] = flag.bodyPath
      bodyObj[a] = provided
      hasBody = true
    }
  }

  // Runtime conditional-required check: for every per-branch flag
  // marked required for its branch, ensure the user supplied a value
  // when their discriminator selection matches that branch. We skip
  // this when --body-json was passed.
  if (!bodyJsonProvided) {
    for (const flag of cmd.flags) {
      if (flag.location !== 'body-discriminated' || !flag.required) continue
      const chosen = flag.discriminatorFlag
        ? chosenBranchByFlag.get(flag.discriminatorFlag)
        : undefined
      if (chosen !== flag.discriminatorValue) continue
      const camel = camelize(flag.name)
      if (options[camel] === undefined) {
        throw new Error(
          `missing required flag --${flag.name} for ${flag.discriminatorFlag}=${flag.discriminatorValue}`,
        )
      }
    }
  }

  if (rawBody !== undefined) body = rawBody
  else if (hasBody) body = bodyObj

  return { pathParams, queryParams, body }
}

function camelize(kebabName: string): string {
  return kebabName.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

// ── HTTP exit-code mapping ─────────────────────────────────────────-

function exitCodeFor(status: number | undefined): number {
  if (!status) return 1
  if (status >= 200 && status < 300) return 0
  if (status >= 400 && status < 500) return 1
  if (status >= 500) return 2
  return 1
}

// ── Subcommand registration ─────────────────────────────────────────

function attachCommand(program: Command, cmd: CommandDescriptor): void {
  // Walk down the command-path, creating intermediate group commands
  // as needed. Commander handles nesting naturally — each `command(name)`
  // returns a fresh `Command` you can nest further on.
  let cur: Command = program
  for (let i = 0; i < cmd.commandPath.length - 1; i++) {
    const seg = cmd.commandPath[i]
    let next = findSubcommand(cur, seg)
    if (!next) {
      next = cur.command(seg).description(`${seg} subcommands`)
    }
    cur = next
  }
  const leafName = cmd.commandPath[cmd.commandPath.length - 1]
  let signature = leafName
  for (const arg of cmd.pathArgs) {
    signature += arg.required ? ` <${arg.name}>` : ` [${arg.name}]`
  }
  const sub = cur.command(signature)
  const desc = [cmd.summary, cmd.description].filter(Boolean).join(' — ')
  if (desc) sub.description(desc)
  // Hint about the source spec in the help footer.
  sub.addHelpText('after', `\n  spec: ${cmd.spec}-api (${cmd.method} ${cmd.pathTemplate})`)

  for (const flag of cmd.flags) {
    const opt = new Option(flag.flagTemplate, flag.description || flag.name)
    if (flag.choices.length) opt.choices(flag.choices)
    // Per-branch flags get a CONDITIONAL required check at request-
    // assembly time (see `assembleRequest`); commander can't express
    // "required only if --auth-type=oauth2" natively, so we never set
    // mandatory at the parser level for `body-discriminated` flags.
    if (flag.required && flag.location !== 'body-discriminated') {
      opt.makeOptionMandatory(true)
    }
    // Coercion handlers.
    switch (flag.coerce) {
      case 'integer':
        opt.argParser((v) => {
          const n = Number.parseInt(v, 10)
          if (Number.isNaN(n)) throw new Error(`expected integer for --${flag.name}`)
          return n
        })
        break
      case 'number':
        opt.argParser((v) => {
          const n = Number(v)
          if (Number.isNaN(n)) throw new Error(`expected number for --${flag.name}`)
          return n
        })
        break
      case 'json':
        opt.argParser((v) => {
          try {
            return JSON.parse(v)
          } catch (e) {
            throw new Error(`expected JSON for --${flag.name}: ${(e as Error).message}`, {
              cause: e,
            })
          }
        })
        break
      // boolean / array / string: commander's defaults are correct.
    }
    sub.addOption(opt)
  }

  sub.action(async (...args: unknown[]) => {
    // commander v14 passes positional args first, then the options
    // object, then the command instance. We use the options object and
    // slice off the trailing two entries to get positional values.
    const cmdInstance = args[args.length - 1] as Command
    const options = (args[args.length - 2] as Record<string, unknown>) ?? {}
    const positional = args.slice(0, args.length - 2).map((v) => (v == null ? '' : String(v)))

    const auth = resolveAuth({
      baseUrlFlag: globals.baseUrl,
      tokenFlag: globals.token,
      spec: cmd.spec,
    })
    const client = makeClient(cmd.spec, auth)
    const { pathParams, queryParams, body } = assembleRequest(cmd, positional, options)

    const init: {
      params?: { path?: Record<string, unknown>; query?: Record<string, unknown> }
      body?: unknown
    } = {}
    if (Object.keys(pathParams).length || Object.keys(queryParams).length) {
      init.params = {}
      if (Object.keys(pathParams).length) init.params.path = pathParams
      if (Object.keys(queryParams).length) init.params.query = queryParams
    }
    if (body !== undefined) init.body = body

    let response: Response | undefined
    let data: unknown
    let error: unknown
    try {
      // The public spec writes versioned paths without the /v1 the root
      // server carries (the SDK does the same and prefixes per path). `--test`
      // swaps that prefix for the sandbox's /test/v1 (use an osk_test_ key).
      const versionPrefix = globals.test ? '/test/v1' : '/v1'
      const wirePath =
        cmd.spec === 'public' && cmd.versioned
          ? `${versionPrefix}${cmd.pathTemplate}`
          : cmd.pathTemplate
      const result = await client.request(cmd.method, wirePath, init)
      data = result.data
      error = result.error
      response = result.response
    } catch (e) {
      process.stderr.write(`request failed: ${(e as Error).message}\n`)
      process.exit(2)
    }
    const status = response?.status
    if (!response?.ok) {
      if (!globals.quiet) {
        const body = error ?? data
        process.stderr.write(`HTTP ${status ?? '?'} ${response?.statusText ?? ''}\n`)
        if (body != null) process.stderr.write(JSON.stringify(body, null, 2) + '\n')
      }
      process.exit(exitCodeFor(status))
    }
    if (data !== undefined && !globals.quiet) {
      process.stdout.write(renderResponse(cmd, data))
    }
    process.exit(0)
    // Reference cmdInstance to satisfy strict TS no-unused-locals.
    void cmdInstance
  })
}

function findSubcommand(parent: Command, name: string): Command | undefined {
  return parent.commands.find((c) => c.name() === name)
}

// ── Program assembly ────────────────────────────────────────────────

export interface BuildProgramOptions {
  /** Optional descriptor set (test injection — defaults to ./generated). */
  descriptors?: CommandDescriptor[]
  /** Suppress process.exit() — used by `os --help` smoke tests. */
  exitOverride?: boolean
}

export async function buildProgram(opts: BuildProgramOptions = {}): Promise<Command> {
  const program = new Command()
  // Required so subcommands (backup / restore / doctor / rotate-secret)
  // can `.passThroughOptions(true)` and forward raw argv to the shared
  // scripts' own parsers without commander stealing flags.
  program.enablePositionalOptions(true)
  program
    .name('os')
    .description('OpenSteward CLI — operator + developer surface, generated from the OpenAPI specs')
    .version(getVersion())
    .option('--base-url <url>', 'admin-api or integration-server base URL')
    .option('--test', 'target the /test/v1 sandbox with an osk_test_ key (public API commands)')
    .option('--token <jwt>', 'bearer token (overrides credentials file + env)')
    .option('--json', 'emit raw JSON instead of the renderer-chosen format')
    .option('--jsonpath <expr>', 'JSONPath filter to apply to the response')
    .option('--quiet', 'suppress non-essential output')
    .option('--no-color', 'disable ANSI color in output')
    .hook('preAction', (thisCommand) => {
      const o = thisCommand.optsWithGlobals<{
        baseUrl?: string
        test?: boolean
        token?: string
        json?: boolean
        quiet?: boolean
        color?: boolean
        jsonpath?: string
      }>()
      globals = {
        baseUrl: o.baseUrl,
        test: !!o.test,
        token: o.token,
        json: !!o.json,
        quiet: !!o.quiet,
        // commander negates --no-color → color: false
        noColor: o.color === false,
        jsonpath: o.jsonpath,
      }
    })

  let descriptors = opts.descriptors
  if (!descriptors) {
    // Lazy-load the generated index. Wrapped in a try so the dev path
    // (before first `cli:generate`) still prints `os --help` cleanly.
    try {
      const mod = (await import('./generated/index.js')) as {
        allCommands: () => CommandDescriptor[]
      }
      descriptors = mod.allCommands()
    } catch {
      descriptors = []
    }
  }
  for (const cmd of descriptors) {
    try {
      attachCommand(program, cmd)
    } catch (e) {
      // Don't let one bad descriptor sink the whole binary.
      process.stderr.write(`[os] skipped ${cmd.commandPath.join(' ')}: ${(e as Error).message}\n`)
    }
  }

  registerOfflineTools(program)
  registerSetup(program)
  if (opts.exitOverride) program.exitOverride()
  return program
}

function getVersion(): string {
  // Read from package.json at build time would be ideal, but the
  // generated bundle structure makes that fragile. The version string
  // is the source of truth in package.json; we mirror it as a constant
  // emitted at build time.
  return '0.1.0'
}
