/**
 * `offline-tools` — registers the four offline scripts that don't
 * exist in any OpenAPI spec because they're filesystem operations:
 *
 *   - `os backup`   — snapshot every docker volume into a tarball
 *   - `os restore`  — counterpart of `backup`
 *   - `os doctor`   — preflight checks on env / configs / disk / license
 *   - `os rotate-secret` — rotate STORE_ENCRYPTION_KEY for every SQLite db
 *
 * They live in `packages/shared/src/scripts/` and stay there — the CLI
 * imports them as library functions and wraps them as commander
 * subcommands. Single binary, zero duplication.
 *
 * The arg surface mirrors each script's `pnpm` equivalent so a user
 * scripting against `pnpm backup` can swap to `os backup` without
 * relearning the flags.
 */

import { Command } from 'commander'
import { runBackup, parseArgs as parseBackupArgs } from '@opensteward/shared/scripts/backup'
import { runRestore, parseArgs as parseRestoreArgs } from '@opensteward/shared/scripts/restore'
import { runDoctor, renderReport } from '@opensteward/shared/scripts/doctor'
import {
  rotateStoreSecret,
  parseArgs as parseRotateArgs,
} from '@opensteward/shared/scripts/rotate-store-secret'

/**
 * Wrap each shared script as a passthrough commander subcommand.
 * Commander's `allowUnknownOption` + `passThroughOptions` route the
 * raw flags straight to the script's `parseArgs(...)` so we don't
 * have to re-declare each flag here — the scripts already own their
 * own surfaces, and the CLI just ferries argv through.
 */
export function registerOfflineTools(program: Command): void {
  program
    .command('backup')
    .description('Snapshot every docker volume + .env + config files into a single tarball')
    .allowUnknownOption(true)
    .passThroughOptions(true)
    .helpOption(false)
    .argument('[args...]')
    .action(async (rest: string[]) => {
      if (rest.includes('--help') || rest.includes('-h')) {
        printBackupHelp()
        return
      }
      const args = parseBackupArgs(rest)
      const result = await runBackup(args)
      process.stdout.write(`Wrote ${result.tarballPath}\n`)
    })

  program
    .command('restore')
    .description('Restore an OpenSteward backup tarball (counterpart of `os backup`)')
    .allowUnknownOption(true)
    .passThroughOptions(true)
    .helpOption(false)
    .argument('[args...]')
    .action(async (rest: string[]) => {
      if (rest.includes('--help') || rest.includes('-h')) {
        printRestoreHelp()
        return
      }
      const args = parseRestoreArgs(rest)
      await runRestore(args)
    })

  program
    .command('doctor')
    .description(
      'Preflight checks: env vars, config drift, disk, schema versions, encrypted-blob round-trip, license',
    )
    .allowUnknownOption(true)
    .passThroughOptions(true)
    .helpOption(false)
    .argument('[args...]')
    .action((rest: string[]) => {
      if (rest.includes('--help') || rest.includes('-h')) {
        printDoctorHelp()
        return
      }
      const repoRoot = parseDoctorRepoRoot(rest)
      const report = runDoctor({ repoRoot })
      process.stdout.write(renderReport(report))
      process.exit(report.exitCode)
    })

  program
    .command('rotate-secret')
    .description(
      'Rotate STORE_ENCRYPTION_KEY on every SQLite db (offline; refuses if WAL is fresh)',
    )
    .allowUnknownOption(true)
    .passThroughOptions(true)
    .helpOption(false)
    .argument('[args...]')
    .action((rest: string[]) => {
      if (rest.includes('--help') || rest.includes('-h')) {
        printRotateHelp()
        return
      }
      const args = parseRotateArgs(rest)
      rotateStoreSecret(args)
    })
}

// ── Help texts — re-emitted here so `os <tool> --help` produces the
//    same usage string the operator gets from `pnpm <tool> --help`,
//    without sucking the printUsage functions out of the shared
//    scripts (they're not exported).

function printBackupHelp(): void {
  process.stdout.write(
    [
      'os backup — snapshot every docker volume + .env + config files into a single tarball',
      '',
      'Usage:',
      '  os backup [--repo-root <path>] [--out-dir <path>]',
      '',
      'Run from the repo root. Stop services first — the tool refuses if a writer is still attached.',
      '',
      'Output:',
      '  backups/opensteward-<ISO timestamp>.tar.gz',
      '',
      'Restore with:',
      '  os restore backups/<file>.tar.gz',
      '',
      'Test-only flags:',
      '  --unsafe-allow-live-db   skip the WAL guard (CI/unit tests)',
      '  --volumes-base <path>    resolve volumes under <path>/<name> instead of via docker',
      '',
    ].join('\n'),
  )
}

function printRestoreHelp(): void {
  process.stdout.write(
    [
      'os restore — restore a backup tarball produced by `os backup`',
      '',
      'Usage:',
      '  os restore <tarball> [--repo-root <path>] [--volumes-base <path>] [--force]',
      '',
      'Services must be stopped first. The tool refuses if a WAL/-shm sibling exists for any',
      'live SQLite file inside any target volume mount path (same guard pattern as `os backup`).',
      '',
    ].join('\n'),
  )
}

function printDoctorHelp(): void {
  process.stdout.write(
    [
      'os doctor — preflight an OpenSteward deployment',
      '',
      'Usage:',
      '  os doctor [--repo-root <path>] [--env-file <path>] [--no-network] [--json]',
      '',
      'Checks env vars, .env/.env.example drift, docker-compose volumes/free space, ',
      'config-drift, schema versions, encrypted-blob round-trip, and compose-override hygiene,',
      'and reports the license integration-server will run under (never a FAIL).',
      'Exits non-zero on any FAIL.',
      '',
    ].join('\n'),
  )
}

function printRotateHelp(): void {
  process.stdout.write(
    [
      'os rotate-secret — rotate STORE_ENCRYPTION_KEY on every SQLite db',
      '',
      'Usage:',
      '  os rotate-secret --old-key <hex64> --new-key <hex64> [--data-dir <path>]',
      '',
      'Offline operation. Refuses if any of the target db files has a fresh WAL sibling.',
      '',
    ].join('\n'),
  )
}

// `doctor.ts` does not export a parseArgs the way the other scripts do.
// The only operator-facing knob is `--repo-root`; the rest of the
// DoctorOptions surface is for test injection. Mirror the shared
// script's behaviour: walk up from cwd to the repo root unless an
// explicit `--repo-root` is passed.
function parseDoctorRepoRoot(argv: string[]): string {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repo-root') return argv[i + 1] ?? process.cwd()
  }
  return process.cwd()
}
