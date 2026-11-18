/**
 * Command-line front end for `copyDatabase`. Each service ships a two-line
 * entry point (`apps/<service>/src/db-copy.ts` → `dist/db-copy.js` in its
 * image) that passes its own profiles, because only the service knows which
 * stores it opens.
 */
import { copyDatabase } from './copy'
import { parseEndpoint } from './endpoint'
import { DbCopyError, EXIT_CODES } from './errors'
import type { DbCopyProfile } from './profile'

export interface CliIo {
  out?: (line: string) => void
  err?: (line: string) => void
  env?: NodeJS.ProcessEnv
  /** How the help text names the command. */
  program?: string
}

interface Parsed {
  db?: string
  from?: string
  to?: string
  overwrite: boolean
  dryRun: boolean
  ignoreUnknown: boolean
  backup: boolean
  batchSize?: number
  backupDir?: string
  keepBackups?: number
  list: boolean
  help: boolean
}

function parse(argv: string[]): Parsed {
  const p: Parsed = {
    overwrite: false,
    dryRun: false,
    ignoreUnknown: false,
    backup: true,
    list: false,
    help: false,
  }
  const takesValue = new Set([
    '--db',
    '--from',
    '--to',
    '--batch-size',
    '--backup-dir',
    '--keep-backups',
  ])
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i]!
    let value: string | undefined
    const eq = arg.indexOf('=')
    if (arg.startsWith('--') && eq > 0) {
      value = arg.slice(eq + 1)
      arg = arg.slice(0, eq)
    }
    if (takesValue.has(arg) && value === undefined) {
      value = argv[++i]
      if (value === undefined) throw new DbCopyError('USAGE', `${arg} needs a value`)
    }
    switch (arg) {
      case '--db':
        p.db = value
        break
      case '--from':
        p.from = value
        break
      case '--to':
        p.to = value
        break
      case '--batch-size':
        p.batchSize = Number(value)
        break
      case '--keep-backups':
        p.keepBackups = Number(value)
        break
      case '--backup-dir':
        p.backupDir = value
        break
      case '--overwrite':
        p.overwrite = true
        break
      case '--dry-run':
        p.dryRun = true
        break
      case '--ignore-unknown':
        p.ignoreUnknown = true
        break
      case '--no-backup':
        p.backup = false
        break
      case '--list':
        p.list = true
        break
      case '-h':
      case '--help':
        p.help = true
        break
      default:
        throw new DbCopyError('USAGE', `unknown argument: ${arg}`)
    }
  }
  return p
}

function help(program: string, profiles: DbCopyProfile[]): string {
  const first = profiles[0]
  const example = first?.defaultSqlitePath ?? '/path/to/service.db'
  return [
    `usage: ${program} [--db <name>] --from <endpoint> --to <endpoint> [options]`,
    '',
    'Copies every row of one service database between SQLite and Postgres (either',
    'direction), in one target transaction, and verifies the row count of every',
    "table before committing. The target is first migrated to this build's schema",
    "through the service's own migrations; the source must already be at it.",
    '',
    'Databases (--db, optional when there is only one):',
    ...profiles.map(
      (p) =>
        `  ${p.name.padEnd(12)} ${p.description}` +
        (p.defaultSqlitePath
          ? `\n  ${''.padEnd(12)} SQLite file in the image: ${p.defaultSqlitePath}`
          : ''),
    ),
    '',
    'Endpoints:',
    '  sqlite:<path>             a SQLite file',
    '  postgres://…              a Postgres URL (credentials are never printed)',
    '  env:<NAME>                the URL in environment variable NAME, e.g. env:DATABASE_URL',
    '',
    'Options:',
    '  --dry-run                 check both sides and print row counts; write nothing',
    '  --overwrite               replace a target that already holds data',
    '  --no-backup               skip the backup taken before writing to an existing target:',
    '                            the snapshot of a SQLite file (<file>.pre-copy-<time>.bak), or',
    '                            the pg_dump of a Postgres target that holds rows. Without',
    '                            pg_dump on PATH (as in the service images) overwriting such',
    '                            a target is refused until you back it up and pass this',
    '  --keep-backups <n>        snapshots of a SQLite target to keep per file, newest first',
    '                            (default 3); older ones go after a successful copy',
    "  --backup-dir <dir>        where the pg_dump goes (default: the SQLite source's",
    '                            directory, else the current one)',
    '  --ignore-unknown          copy a SQLite source that also holds tables this',
    '                            database profile does not know (they are NOT copied)',
    '  --batch-size <n>          rows per batch (default 500)',
    '  --list                    list the databases this service can copy',
    '',
    'Exit codes: 0 copied (or dry run OK) · 1 failed and rolled back, including a row-count',
    'mismatch · 2 usage · 3 target holds data (needs --overwrite) · 4 schema versions or',
    'tables differ · 5 source has nothing to copy · 6 no backup possible (see --no-backup).',
    'Stop the service before copying.',
    '',
    'Example:',
    `  ${program} --from sqlite:${example} --to env:DATABASE_URL --dry-run`,
  ].join('\n')
}

/** Run the CLI; resolves to the process exit code. */
export async function runDbCopyCli(
  argv: string[],
  profiles: DbCopyProfile[],
  io: CliIo = {},
): Promise<number> {
  const out = io.out ?? ((l: string) => console.log(l))
  const err = io.err ?? ((l: string) => console.error(l))
  const program = io.program ?? 'db-copy'
  try {
    const args = parse(argv)
    if (args.help) {
      out(help(program, profiles))
      return 0
    }
    if (args.list) {
      for (const p of profiles) out(`${p.name}\t${p.description}`)
      return 0
    }
    let profile: DbCopyProfile | undefined
    if (args.db) {
      profile = profiles.find((p) => p.name === args.db)
      if (!profile) {
        throw new DbCopyError(
          'USAGE',
          `unknown database '${args.db}' (this service has: ${profiles.map((p) => p.name).join(', ')})`,
        )
      }
    } else if (profiles.length === 1) {
      profile = profiles[0]
    } else {
      throw new DbCopyError(
        'USAGE',
        `--db is required: one of ${profiles.map((p) => p.name).join(', ')}`,
      )
    }
    if (!args.from || !args.to) throw new DbCopyError('USAGE', '--from and --to are both required')
    await copyDatabase({
      profile: profile!,
      from: parseEndpoint(args.from, io.env),
      to: parseEndpoint(args.to, io.env),
      overwrite: args.overwrite,
      dryRun: args.dryRun,
      ignoreUnknown: args.ignoreUnknown,
      backup: args.backup,
      batchSize: args.batchSize,
      backupDir: args.backupDir,
      keepBackups: args.keepBackups,
      log: out,
    })
    return 0
  } catch (e) {
    if (e instanceof DbCopyError) {
      const verb =
        e.code === 'FAILED' || e.code === 'ROW_COUNT_MISMATCH'
          ? 'FAILED'
          : e.code === 'USAGE'
            ? 'usage'
            : 'refused (nothing written)'
      err(`db-copy: ${verb}: ${e.message}`)
      if (e.code === 'USAGE') err(`run '${program} --help' for usage`)
      return e.exitCode
    }
    err(`db-copy: FAILED: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`)
    return EXIT_CODES.FAILED
  }
}
