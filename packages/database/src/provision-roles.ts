// QMULATE — database role provisioning.  (ADR-0008 round 6 — privilege separation)
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS IS A SCRIPT AND NOT A MIGRATION
// ═══════════════════════════════════════════════════════════════════════════════════════════
// `CREATE ROLE` needs `CREATEROLE`; `ALTER … OWNER TO` needs to already be the owner. The migrator
// must hold NEITHER — a migrator that can create roles can create itself a superuser, and a
// migrator that can hand ownership around can hand it to the runtime role. So the two privileged
// acts that establish the separation live OUT of band, run ONCE per environment on the platform
// credential (Railway's `postgres`, CI's service-container superuser, the embedded cluster's
// `qmulate`), and every migration afterwards is ordinary owner-level DDL.
//
// Migration 10 §2 carries the other half — the per-table GRANT/REVOKE matrix — as
// `qmulate_apply_privilege_matrix()`, which this script calls at the end. That split is deliberate:
// the matrix must be re-appliable by a migration (it changes whenever a table is added), while role
// creation must not be.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠ WHAT IT DOES NOT DO
// ═══════════════════════════════════════════════════════════════════════════════════════════
// It does not store credentials anywhere. It reads the three application connection strings, takes
// each role's name and password FROM the URL that will be used to connect as it, and asserts the
// username matches the canonical role name. That is deliberate: a provisioning script that invents
// its own passwords guarantees a mismatch between "what was created" and "what the app connects
// with", and the failure mode is an authentication error nobody associates with this file.
//
// ⚠ NOTHING IN THIS FILE IS EXPORTED FROM `src/index.ts`. It imports `pg` (a devDependency) and is
// invoked as a program; exporting it would make `pg` a runtime dependency of every consumer.

import { Client } from 'pg';

/** The canonical role names. Kept in step with migration 10 §1 by `test/connection-roles.test.ts`. */
export const RUNTIME_ROLE = 'qmulate_app';
export const PROVISIONING_ROLE = 'qmulate_provisioner';
export const OWNER_ROLE = 'qmulate_owner';

/**
 * The queue transport's role (S10/T1 — Option B, CHOSEN not forced; the record is BUILD-PLAN's S10
 * row). It OWNS schema `pgboss` and holds NOTHING in `public`: migration 10's privilege matrix
 * deliberately does not know it, it gets no database-level CREATE, and CENSUS-G asserts its
 * public-schema grant count is ZERO. pg-boss connects AS this role and runs its own DDL inside the
 * one schema it owns — which is why `qmulate_app` gains no privilege at all from the queue
 * existing (the alternative, app-role DML on pgboss.*, would have eroded "DELETE on the identity
 * plane and nowhere else").
 */
export const PGBOSS_ROLE = 'qmulate_pgboss';
/** The schema {@link PGBOSS_ROLE} owns. pg-boss's own tables live here; nothing else does. */
export const PGBOSS_SCHEMA = 'pgboss';

export interface ProvisionOptions {
  /** Platform superuser / `rds_superuser` connection. Connection D. */
  superuserUrl: string;
  /** Connection A — becomes `qmulate_app`. */
  appUrl: string;
  /** Connection B — becomes `qmulate_provisioner`. */
  provisionerUrl: string;
  /** Connection C — becomes `qmulate_owner`. */
  migratorUrl: string;
  /** Connection E — becomes `qmulate_pgboss`, the queue transport's own credential (S10/T1). */
  pgbossUrl: string;
  /**
   * `CREATEDB` on the owner, needed only for `prisma migrate dev`'s shadow database. Production runs
   * `migrate deploy` only and should pass `false`.
   */
  ownerCreateDb?: boolean;
  log?: (line: string) => void;
}

interface RoleSpec {
  name: string;
  password: string;
}

/**
 * Splits a `postgresql://user:password@host/db` URL into the credential it authenticates with.
 *
 * ⚠ NEVER LOG THE RESULT. `packages/config/src/env.ts` states the rule for this repository — errors
 * name variables and never values, because these strings carry passwords. This function throws with
 * the variable name only.
 */
function credentialFromUrl(url: string, variableName: string, expectedRole: string): RoleSpec {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${variableName} is not a parseable URL.`);
  }
  const rawName = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  if (rawName === '') {
    throw new Error(`${variableName} carries no username, so no role can be provisioned from it.`);
  }
  // A connection pooler that multiplexes tenants (Supabase's Supavisor) addresses a role as
  // `<role>.<tenant>`; the ROLE the server authenticates is still `<role>`, and that is what is
  // provisioned. Only the canonical role name may precede the tenant suffix — anything else is
  // refused below exactly as before.
  const name = rawName.startsWith(`${expectedRole}.`) ? expectedRole : rawName;
  if (name !== expectedRole) {
    throw new Error(
      `${variableName} connects as "${name}", but privilege separation requires "${expectedRole}". ` +
        `The canonical role names are pinned in this file (${RUNTIME_ROLE} / ${PROVISIONING_ROLE} / ` +
        `${OWNER_ROLE}, from migration 10 §1, whose privilege matrix, RLS policies and posture ` +
        `assertion all read the three application roles — plus ${PGBOSS_ROLE}, the queue role ` +
        `migration 10 deliberately does NOT know). A URL naming a different role would be ` +
        `provisioned and then hold no privileges at all.`,
    );
  }
  if (password === '') {
    throw new Error(
      `${variableName} carries no password. A LOGIN role with no password cannot authenticate under ` +
        `md5/scram, and provisioning one would look like success and fail at connect time.`,
    );
  }
  return { name, password };
}

/** Doubles single quotes so a password can be embedded in a `CREATE ROLE … PASSWORD '…'` literal. */
function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Doubles double quotes so an identifier can be embedded safely. */
function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * The role-family attribute census — section 1b of {@link provisionDatabaseRoles}, EXTRACTED so a
 * test can make it FIRE (S10/T1). In the shipped flow the CREATE/ALTER loop repairs attributes
 * BEFORE this census runs, so a pre-planted `BYPASSRLS` never reaches it there — the census is
 * the belt against a partial failure of those statements. A control nobody has seen refuse is
 * not a control, so `provision-posture.integration.test.ts` plants the attribute and calls THIS
 * function directly, watching the refusal fire, then runs the full provision and watches the
 * repair win.
 *
 * ⚠ The count assertion is honest only about the names the query asks for — it goes red at three
 * or five OF THESE FOUR, and cannot notice a fifth role it never queried. The control that
 * catches an unexpected member of the qmulate_% family is CENSUS-G's derived role sweep
 * (grant-census.integration.test.ts), not this line.
 */
export async function assertRoleFamilyPosture(client: Client): Promise<void> {
  const attrs = await client.query<{
    rolname: string;
    rolsuper: boolean;
    rolbypassrls: boolean;
    rolcanlogin: boolean;
    rolcreaterole: boolean;
  }>(
    `SELECT rolname, rolsuper, rolbypassrls, rolcanlogin, rolcreaterole
       FROM pg_roles WHERE rolname = ANY($1::text[])`,
    [[RUNTIME_ROLE, PROVISIONING_ROLE, OWNER_ROLE, PGBOSS_ROLE]],
  );
  if (attrs.rows.length !== 4) {
    throw new Error(
      `Expected 4 provisioned roles, found ${String(attrs.rows.length)}: ` +
        attrs.rows.map((r) => r.rolname).join(', '),
    );
  }
  for (const row of attrs.rows) {
    if (row.rolsuper || row.rolbypassrls) {
      throw new Error(
        `Role ${row.rolname} is SUPERUSER=${String(row.rolsuper)} ` +
          `BYPASSRLS=${String(row.rolbypassrls)}. Either attribute makes migration 11's ` +
          `FORCE ROW LEVEL SECURITY decorative and lets the role bypass every GRANT in ` +
          `migration 10. Refusing to report a separation that does not exist.`,
      );
    }
    if (!row.rolcanlogin) {
      throw new Error(`Role ${row.rolname} cannot LOGIN, so nothing can connect as it.`);
    }
    if (row.rolcreaterole) {
      throw new Error(
        `Role ${row.rolname} holds CREATEROLE, which lets it create a role with any attribute ` +
          `and become it. Role creation must stay out of band.`,
      );
    }
  }
}

/**
 * Creates the four roles, reassigns ownership of everything in `public` to `qmulate_owner`,
 * creates the queue schema owned by `qmulate_pgboss` (S10/T1), and applies the privilege matrix.
 * Idempotent: safe before migrations exist (roles only) and after (roles + ownership + matrix).
 *
 * Returns a human-readable list of what it changed, so a run that changed nothing is visibly
 * different from a run that did work.
 */
export async function provisionDatabaseRoles(options: ProvisionOptions): Promise<string[]> {
  // `console.warn`, not `console.log`: this package's lint rule permits only `warn`/`error`, and a
  // provisioning script's output IS its audit trail — stderr is the right place for it anyway.
  const log = options.log ?? ((line: string) => console.warn(line));
  const changes: string[] = [];

  const app = credentialFromUrl(options.appUrl, 'DATABASE_URL', RUNTIME_ROLE);
  const provisioner = credentialFromUrl(
    options.provisionerUrl,
    'ACCESS_MATRIX_DATABASE_URL',
    PROVISIONING_ROLE,
  );
  const owner = credentialFromUrl(options.migratorUrl, 'MIGRATOR_DATABASE_URL', OWNER_ROLE);
  const pgboss = credentialFromUrl(options.pgbossUrl, 'PGBOSS_DATABASE_URL', PGBOSS_ROLE);

  const client = new Client({ connectionString: options.superuserUrl });
  await client.connect();

  try {
    // ── 0 · Refuse to run on a connection that cannot do the job ──────────────────────────────
    const who = await client.query<{ current_user: string; rolsuper: boolean }>(
      `SELECT current_user, COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false) AS rolsuper`,
    );
    const actor = who.rows[0];
    if (!actor) throw new Error('Could not determine the provisioning connection identity.');
    log(`[provision] connected as "${actor.current_user}" (superuser: ${String(actor.rolsuper)})`);

    // ── 1 · The three roles ───────────────────────────────────────────────────────────────────
    //
    // ⚠ NOSUPERUSER NOBYPASSRLS ARE BOTH MANDATORY, NOT TIDINESS. `FORCE ROW LEVEL SECURITY`
    // (migration 11) binds neither a superuser nor a `BYPASSRLS` role, so an owner holding either
    // makes that whole migration decorative. NOCREATEROLE keeps role creation out of band, which is
    // the property this file exists to preserve.
    //
    // `CREATE ROLE` fails with 42710 on a re-run and `DROP ROLE` fails while the role owns objects,
    // so the shape is create-if-absent + unconditional ALTER (which also repairs a role somebody
    // created by hand with the wrong attributes, and rotates the password to match the URL).
    for (const [role, spec] of [
      [RUNTIME_ROLE, app],
      [PROVISIONING_ROLE, provisioner],
      [OWNER_ROLE, owner],
      [PGBOSS_ROLE, pgboss],
    ] as const) {
      const existing = await client.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [role]);
      const ident = quoteIdent(role);
      const attributes =
        `LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOREPLICATION ` +
        (role === OWNER_ROLE && options.ownerCreateDb !== false ? 'CREATEDB' : 'NOCREATEDB');

      if (existing.rowCount === 0) {
        await client.query(
          `CREATE ROLE ${ident} ${attributes} PASSWORD ${quoteLiteral(spec.password)}`,
        );
        changes.push(`created role ${role}`);
        log(`[provision] created role ${role}`);
      } else {
        await client.query(
          `ALTER ROLE ${ident} ${attributes} PASSWORD ${quoteLiteral(spec.password)}`,
        );
        log(`[provision] role ${role} already existed — attributes and password re-asserted`);
      }
    }

    // ── 1b · ASSERT the attributes, rather than trusting the statements above ──────────────────
    await assertRoleFamilyPosture(client);

    // ── 1c · No role may be a MEMBER of another ───────────────────────────────────────────────
    //
    // `SET ROLE qmulate_owner` from the runtime role is refused with 42501 only while the runtime
    // role is not a member of the owner. A membership granted for convenience would hand the whole
    // owner privilege set to the request path in one statement, and nothing else in this design
    // would notice.
    const memberships = await client.query<{ member: string; grantedRole: string }>(
      `SELECT m.rolname AS member, g.rolname AS "grantedRole"
         FROM pg_auth_members am
         JOIN pg_roles m ON m.oid = am.member
         JOIN pg_roles g ON g.oid = am.roleid
        WHERE m.rolname = ANY($1::text[]) AND g.rolname = ANY($1::text[])`,
      [[RUNTIME_ROLE, PROVISIONING_ROLE, OWNER_ROLE, PGBOSS_ROLE]],
    );
    if (memberships.rows.length > 0) {
      throw new Error(
        `These roles are members of one another, which defeats the separation: ` +
          memberships.rows.map((r) => `${r.member} -> ${r.grantedRole}`).join(', ') +
          `. Revoke with: REVOKE <granted> FROM <member>;`,
      );
    }

    // ── 2 · Ownership ─────────────────────────────────────────────────────────────────────────
    //
    // Explicit `ALTER … OWNER TO` loops rather than `REASSIGN OWNED BY`, for two reasons: the
    // previous owner is often the platform superuser, which owns objects outside this schema that
    // must not move; and the loops let this script COUNT what it changed and print it, which
    // `REASSIGN OWNED` cannot.
    //
    // Enum TYPES are included and are easy to forget. Prisma models every enum as a Postgres type,
    // and a later migration that does `ALTER TYPE … ADD VALUE` fails with 42501 if the type is still
    // owned by the platform user while the migrator is `qmulate_owner`.
    // ⚠ `CREATE` ON THE DATABASE IS REQUIRED AND IS EASY TO MISS. MEASURED: without it,
    // `prisma migrate deploy` fails on the FIRST migration with
    // `42501 permission denied for database <db>` — the migrate engine issues
    // `CREATE SCHEMA IF NOT EXISTS "public"`, which is a database-level privilege, not a schema-level
    // one. `TEMPORARY` is granted for the same class of reason: Prisma's shadow-database diffing and
    // some introspection paths create temp objects.
    const dbName = (await client.query<{ db: string }>(`SELECT current_database() AS db`)).rows[0]
      ?.db;
    if (dbName === undefined) throw new Error('Could not read current_database().');
    await client.query(
      `GRANT CREATE, CONNECT, TEMPORARY ON DATABASE ${quoteIdent(dbName)} TO ${quoteIdent(OWNER_ROLE)}`,
    );
    // The two application roles need CONNECT and nothing else at database level. PUBLIC usually has
    // CONNECT already; granting it explicitly means the posture survives a `REVOKE … FROM PUBLIC`
    // hardening step later, and it is asserted rather than assumed.
    await client.query(
      `GRANT CONNECT ON DATABASE ${quoteIdent(dbName)} TO ${quoteIdent(RUNTIME_ROLE)}, ${quoteIdent(PROVISIONING_ROLE)}`,
    );
    // ⚠ THE QUEUE ROLE GETS DATABASE-LEVEL CREATE, AND THAT IS A MEASURED NECESSITY, NOT A
    // LOOSENING OF THE BOUND. Measured 2026-09-01 (S10/T1, port 54453): Postgres checks the
    // database CREATE privilege on `CREATE SCHEMA IF NOT EXISTS` BEFORE the existence
    // short-circuit — so pg-boss's own migrate-on-start DDL, whose first statement is exactly
    // that, dies with `42501 permission denied for database` even though the schema already
    // exists AND the caller owns it. Database-level CREATE permits creating NEW schemas and
    // nothing else; the bound that matters — NEVER CREATE ON `public` — is a SCHEMA-level
    // privilege this role does not hold, asserted live by the transport posture test
    // (`has_schema_privilege('qmulate_pgboss','public','CREATE') = false`) and by CENSUS-G's
    // zero-public-grants sweep. The rejected alternative was stripping the CREATE SCHEMA line
    // out of pg-boss's versioned construction plans — a coupling to library internals that
    // re-implements its migration story badly.
    await client.query(
      `GRANT CREATE, CONNECT ON DATABASE ${quoteIdent(dbName)} TO ${quoteIdent(PGBOSS_ROLE)}`,
    );

    await client.query(`ALTER SCHEMA public OWNER TO ${quoteIdent(OWNER_ROLE)}`);

    // ── 2b · The queue schema (S10/T1) ─────────────────────────────────────────────────────────
    //
    // `CREATE SCHEMA … AUTHORIZATION` from the superuser, NOT a database-level CREATE grant to the
    // role: `qmulate_pgboss` must be able to run pg-boss's DDL inside its own schema and create
    // nothing anywhere else. `IF NOT EXISTS` skips the AUTHORIZATION clause on a re-run, so the
    // owner is asserted and repaired separately — a schema somebody hand-created as the wrong
    // owner would otherwise stay wrong forever while this script kept reporting success.
    const schemaRow = await client.query<{ owner: string }>(
      `SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname = $1`,
      [PGBOSS_SCHEMA],
    );
    if (schemaRow.rowCount === 0) {
      await client.query(
        `CREATE SCHEMA ${quoteIdent(PGBOSS_SCHEMA)} AUTHORIZATION ${quoteIdent(PGBOSS_ROLE)}`,
      );
      changes.push(`created schema ${PGBOSS_SCHEMA} owned by ${PGBOSS_ROLE}`);
      log(`[provision] created schema ${PGBOSS_SCHEMA} owned by ${PGBOSS_ROLE}`);
    } else if (schemaRow.rows[0]?.owner !== PGBOSS_ROLE) {
      await client.query(
        `ALTER SCHEMA ${quoteIdent(PGBOSS_SCHEMA)} OWNER TO ${quoteIdent(PGBOSS_ROLE)}`,
      );
      changes.push(`repaired schema ${PGBOSS_SCHEMA} owner to ${PGBOSS_ROLE}`);
      log(
        `[provision] schema ${PGBOSS_SCHEMA} existed with owner ` +
          `"${schemaRow.rows[0]?.owner ?? '?'}" — repaired to ${PGBOSS_ROLE}`,
      );
    } else {
      log(`[provision] schema ${PGBOSS_SCHEMA} already owned by ${PGBOSS_ROLE}`);
    }

    const ownershipStatements: { label: string; sql: string }[] = [];

    const tables = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tableowner <> $1 ORDER BY 1`,
      [OWNER_ROLE],
    );
    for (const row of tables.rows) {
      ownershipStatements.push({
        label: `table ${row.tablename}`,
        sql: `ALTER TABLE public.${quoteIdent(row.tablename)} OWNER TO ${quoteIdent(OWNER_ROLE)}`,
      });
    }

    const views = await client.query<{ viewname: string }>(
      `SELECT viewname FROM pg_views WHERE schemaname = 'public' AND viewowner <> $1 ORDER BY 1`,
      [OWNER_ROLE],
    );
    for (const row of views.rows) {
      ownershipStatements.push({
        label: `view ${row.viewname}`,
        sql: `ALTER VIEW public.${quoteIdent(row.viewname)} OWNER TO ${quoteIdent(OWNER_ROLE)}`,
      });
    }

    const sequences = await client.query<{ sequencename: string }>(
      `SELECT sequencename FROM pg_sequences
        WHERE schemaname = 'public' AND sequenceowner <> $1 ORDER BY 1`,
      [OWNER_ROLE],
    );
    for (const row of sequences.rows) {
      ownershipStatements.push({
        label: `sequence ${row.sequencename}`,
        sql: `ALTER SEQUENCE public.${quoteIdent(row.sequencename)} OWNER TO ${quoteIdent(OWNER_ROLE)}`,
      });
    }

    const functions = await client.query<{ sig: string; proname: string }>(
      `SELECT p.oid::regprocedure::text AS sig, p.proname
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND pg_get_userbyid(p.proowner) <> $1
        ORDER BY 2`,
      [OWNER_ROLE],
    );
    for (const row of functions.rows) {
      ownershipStatements.push({
        label: `function ${row.proname}`,
        sql: `ALTER FUNCTION ${row.sig} OWNER TO ${quoteIdent(OWNER_ROLE)}`,
      });
    }

    const types = await client.query<{ typname: string }>(
      `SELECT t.typname
         FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typtype = 'e'
          AND pg_get_userbyid(t.typowner) <> $1
        ORDER BY 1`,
      [OWNER_ROLE],
    );
    for (const row of types.rows) {
      ownershipStatements.push({
        label: `type ${row.typname}`,
        sql: `ALTER TYPE public.${quoteIdent(row.typname)} OWNER TO ${quoteIdent(OWNER_ROLE)}`,
      });
    }

    for (const statement of ownershipStatements) {
      await client.query(statement.sql);
    }
    if (ownershipStatements.length > 0) {
      changes.push(`reassigned ${String(ownershipStatements.length)} object(s) to ${OWNER_ROLE}`);
      log(
        `[provision] reassigned ownership of ${String(ownershipStatements.length)} object(s) to ` +
          `${OWNER_ROLE}: ${ownershipStatements
            .slice(0, 6)
            .map((s) => s.label)
            .join(', ')}${ownershipStatements.length > 6 ? ', …' : ''}`,
      );
    } else {
      log(`[provision] every object in schema public is already owned by ${OWNER_ROLE}`);
    }

    // ── 3 · Inventory, printed rather than assumed ───────────────────────────────────────────
    const inventory = await client.query<{ tables: string; functions: string; sequences: string }>(
      `SELECT (SELECT count(*) FROM pg_tables WHERE schemaname = 'public')::text AS tables,
              (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public')::text AS functions,
              (SELECT count(*) FROM pg_sequences WHERE schemaname = 'public')::text AS sequences`,
    );
    const inv = inventory.rows[0];
    log(
      `[provision] schema public now holds ${inv?.tables ?? '?'} tables, ` +
        `${inv?.functions ?? '?'} functions, ${inv?.sequences ?? '?'} sequences`,
    );

    // ── 4 · The privilege matrix ─────────────────────────────────────────────────────────────
    //
    // Absent before the first `migrate deploy`. That is the normal first-run ordering (roles must
    // exist before migration 10 runs, or its matrix degrades to a NOTICE), so it is a log line and
    // not an error — but it MUST be loud, because "roles created, matrix never applied" is exactly
    // the state that looks provisioned and enforces nothing.
    const hasMatrix = await client.query(
      `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'qmulate_apply_privilege_matrix'`,
    );
    if (hasMatrix.rowCount === 0) {
      log(
        `[provision] qmulate_apply_privilege_matrix() does not exist yet — migrations 10/11 have ` +
          `not run. The roles are in place, so run \`migrate:deploy\` next and migration 10 will ` +
          `apply the matrix itself. NOTHING IS ENFORCED UNTIL IT DOES.`,
      );
    } else {
      await client.query(`SELECT qmulate_apply_privilege_matrix()`);
      changes.push('applied qmulate_apply_privilege_matrix()');
      log('[provision] applied qmulate_apply_privilege_matrix()');
    }

    if (changes.length === 0) log('[provision] nothing to change.');
    return changes;
  } finally {
    await client.end();
  }
}

/**
 * Reads the five connection strings from the environment and provisions.
 *
 * Kept separate from {@link provisionDatabaseRoles} so `scripts/dev-postgres.ts` can call the latter
 * with URLs it just built, without laundering them through `process.env`.
 */
export async function provisionFromEnvironment(log?: (line: string) => void): Promise<string[]> {
  const required = (name: string): string => {
    const value = process.env[name]?.trim();
    if (value === undefined || value === '') {
      throw new Error(
        `${name} is not set. Role provisioning needs all five connection strings: ` +
          `SUPERUSER_DATABASE_URL (the platform credential), DATABASE_URL (${RUNTIME_ROLE}), ` +
          `ACCESS_MATRIX_DATABASE_URL (${PROVISIONING_ROLE}), MIGRATOR_DATABASE_URL ` +
          `(${OWNER_ROLE}) and PGBOSS_DATABASE_URL (${PGBOSS_ROLE}, S10/T1). See .env.example.`,
      );
    }
    return value;
  };

  return provisionDatabaseRoles({
    superuserUrl: required('SUPERUSER_DATABASE_URL'),
    appUrl: required('DATABASE_URL'),
    provisionerUrl: required('ACCESS_MATRIX_DATABASE_URL'),
    migratorUrl: required('MIGRATOR_DATABASE_URL'),
    pgbossUrl: required('PGBOSS_DATABASE_URL'),
    ownerCreateDb: process.env.QMULATE_OWNER_CREATEDB !== '0',
    ...(log ? { log } : {}),
  });
}
