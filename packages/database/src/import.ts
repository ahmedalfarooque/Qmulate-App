// QMULATE — the first-client importer (BR-1106 · V-12 · G-8 LAYER 3).
//
// ⚠ THE FIRST STATEMENT OF `main()` IS THE RESIDENCY GATE, AND EVERY DATABASE MODULE IS IMPORTED
// DYNAMICALLY AFTER IT — the seed's own property, mirrored. A refused run has opened no connection
// and written no row; `import-guardrail.test.ts` proves it on this program, spawned the way CI
// spawns it. The refusal is the FIRST line of stderr, `IMPORT_REFUSED: …`, with no stack trace.
//
//   pnpm --filter @qmulate/database run import -- --source <file> [--dry-run]
//
// Requires DATA_CLASSIFICATION=production AND DATA_RESIDENCY=ksa (G-8d/e), a source that is not the
// fixture (G-8f) and carries no fictional-data marker, and MIGRATOR_DATABASE_URL (the owner: this is
// the owner-credential bootstrap S12 Q7 names — see `import-apply.ts`'s header).

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import {
  ImportRefusedError,
  assertImportSourcePath,
  assertNoFictionalMarker,
  assertResidentProductionTarget,
  isDryRun,
  requestedImportSource,
} from './import-guardrail.js';

async function main(): Promise<void> {
  // ── LAYER 3 OF THE RESIDENCY GUARDRAIL — first statement, no database module imported ─────────
  const target = assertResidentProductionTarget();
  const sourcePath = assertImportSourcePath(requestedImportSource());
  const rawText = readFileSync(sourcePath, 'utf8');
  assertNoFictionalMarker(rawText);

  // Only now: the schema and the mappers (still no connection).
  const { parseImportSource, planImport, applyImport } = await import('./import-apply.js');
  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch (error: unknown) {
    throw new ImportRefusedError(`the source is not valid JSON: ${String(error)}`);
  }
  const source = parseImportSource(raw);
  const plan = planImport(source);
  const dryRun = isDryRun();
  const runId = randomUUID().slice(0, 8);

  process.stdout.write(
    [
      'QMULATE first-client import',
      `  DATA_CLASSIFICATION = ${target.classification}  DATA_RESIDENCY = ${target.residency}  (guardrail layer 3 passed)`,
      `  source              = ${sourcePath}`,
      `  run                 = ${runId}${dryRun ? '  (DRY RUN — nothing will be written)' : ''}`,
      '  plan:',
      ...Object.entries(plan.counts).map(([model, n]) => `    ${model.padEnd(22)} ${String(n)}`),
      plan.ignoredOnboardingBlocks > 0
        ? `  ⚠ ${String(plan.ignoredOnboardingBlocks)} onboarding block(s) in the source are IGNORED — gates are born OPEN (BR-1101).`
        : '  onboarding gates: born OPEN for every imported endowment (BR-1101).',
      plan.bootstrapAdmin === null
        ? '  bootstrap admin: none (the client must already have seats, or be seated afterwards).'
        : `  bootstrap admin: ${plan.bootstrapAdmin} seated SYSTEM_ADMIN on every imported endowment.`,
      '',
    ].join('\n') + '\n',
  );
  if (dryRun) return;

  const result = await applyImport(source, { runId, now: new Date() });
  process.stdout.write(
    [
      `IMPORT_APPLIED run ${result.runId} as ${result.actorId}`,
      ...Object.entries(result.written).map(([model, n]) => `  ${model.padEnd(22)} ${String(n)}`),
      '',
    ].join('\n') + '\n',
  );
}

main().catch((error: unknown) => {
  if (error instanceof ImportRefusedError) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
