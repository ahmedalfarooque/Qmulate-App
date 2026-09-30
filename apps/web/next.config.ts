import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnvConfig } from '@next/env';
import createNextIntlPlugin from 'next-intl/plugin';

import type { NextConfig } from 'next';

/** The monorepo root, as a filesystem path on every platform (`URL.pathname` is not one on Windows). */
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Next loads `.env` relative to the app directory. In this monorepo the single untracked
 * `.env` lives at the repo root (one file, one classification flag — NFR-03 gets harder to
 * reason about with a copy per app), so load it explicitly. A local `apps/web/.env*` still
 * wins, since Next processes it afterwards.
 */
loadEnvConfig(repoRoot, process.env.NODE_ENV !== 'production');

/** Where `prisma generate` writes the client (schema.prisma `generator client { output }`). */
const prismaClientDir = path.join(repoRoot, 'packages', 'database', 'generated', 'client');

/**
 * Ship the Prisma query engine with the server bundle.
 *
 * The client is generated to a custom path inside `packages/database` (not `node_modules`), and
 * `@qmulate/database` is a just-in-time transpiled package, so webpack bundles the client into
 * `.next/server/chunks` and its `__dirname` no longer points at the folder holding the native
 * `libquery_engine-*.so.node`. On Vercel that surfaced as `PrismaClientInitializationError:
 * could not locate the Query Engine for runtime "rhel-openssl-3.0.x"` on the first database
 * call (the sign-in route), after the build itself had succeeded. Prisma's runtime search list
 * includes `.next/server`, so emitting the engine there as a webpack asset — the same mechanism
 * as `@prisma/nextjs-monorepo-workaround-plugin`, without the dependency — makes it resolvable
 * in the serverless function. Every `*.node` engine present is copied, so the Windows engine of
 * a local build and the RHEL engine of a Vercel build are handled alike.
 */
type WebpackContext = Parameters<NonNullable<NextConfig['webpack']>>[1];

/** The slice of webpack's Compiler / Compilation the plugin touches (webpack ships inside Next, untyped here). */
interface EngineCompilation {
  hooks: { processAssets: { tap(options: { name: string; stage: number }, fn: () => void): void } };
  getAsset(name: string): unknown;
  emitAsset(name: string, source: unknown): void;
}
interface EngineCompiler {
  hooks: { thisCompilation: { tap(name: string, fn: (compilation: EngineCompilation) => void): void } };
}

class PrismaEnginePlugin {
  constructor(private readonly bundler: WebpackContext['webpack']) {}

  apply(compiler: EngineCompiler): void {
    const { sources, Compilation } = this.bundler;
    compiler.hooks.thisCompilation.tap('PrismaEnginePlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        { name: 'PrismaEnginePlugin', stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL },
        () => {
          if (!fs.existsSync(prismaClientDir)) {
            throw new Error(
              `Prisma client not generated at ${prismaClientDir}; run \`pnpm db:generate\` before \`next build\`.`,
            );
          }
          for (const file of fs.readdirSync(prismaClientDir)) {
            if (!file.endsWith('.node')) continue;
            if (compilation.getAsset(file)) continue;
            compilation.emitAsset(
              file,
              new sources.RawSource(fs.readFileSync(path.join(prismaClientDir, file))),
            );
          }
        },
      );
    });
  }
}

/**
 * The next-intl request config lives at `src/i18n/request.ts`; the path is passed
 * explicitly rather than relying on convention discovery, so a rename fails loudly.
 */
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * Pin the workspace root. Next otherwise infers it from the OUTERMOST lockfile it can find above
   * the app, and a stray lockfile in a home directory makes it trace (and fail on) the whole user
   * profile. The monorepo root is the only correct answer, on a laptop and on Vercel alike.
   */
  outputFileTracingRoot: repoRoot,

  /**
   * The engine that `PrismaEnginePlugin` (below) emits into `.next/server` is reached through
   * `__dirname` at runtime, so file tracing cannot see it; force it into every serverless
   * function, or Vercel ships the bundle without it (measured: the build passed, the first
   * sign-in failed).
   */
  outputFileTracingIncludes: { '/**/*': ['./.next/server/libquery_engine-*.so.node'] },

  /**
   * Turborepo "Just-in-Time Packages": every `@qmulate/*` library ships TypeScript source
   * with no build step, so the app compiles them.
   */
  transpilePackages: [
    '@qmulate/ui',
    '@qmulate/i18n',
    '@qmulate/auth',
    '@qmulate/database',
    '@qmulate/config',
  ],

  /**
   * The generated Prisma client is a CommonJS artifact with `.node` engine binaries at
   * `packages/database/generated/client`. Bundling it into the server output breaks the
   * engine resolution — keep it external.
   */
  serverExternalPackages: ['@prisma/client', 'prisma', '.prisma/client'],

  /**
   * The `@qmulate/*` packages write ESM-correct relative imports (`./foo.js`) that resolve to
   * `./foo.ts` on disk. Bundlers must be told that mapping explicitly, or the just-in-time
   * transpile above fails with "Can't resolve './extensions/audit.js'".
   *
   * Both bundlers need it: `extensionAlias` for webpack (`next build`), `resolveAlias`
   * + `resolveExtensions` for Turbopack (`next dev --turbopack`).
   */
  webpack: (config, { isServer, webpack }) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };
    if (isServer) {
      config.plugins.push(new PrismaEnginePlugin(webpack));
    }
    return config;
  },

  turbopack: {
    resolveExtensions: ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs', '.json'],
  },

  /**
   * `lint` is its own Turborepo task (and its own CI job, run before `build`). Running it
   * a second time inside `next build` only produces a slower, differently-configured
   * duplicate. Type errors still fail the build — that is deliberate.
   */
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },

  // Data residency (NFR-03): nothing here may reach out to a non-KSA origin at runtime.
  images: { remotePatterns: [] },

  poweredByHeader: false,
};

export default withNextIntl(nextConfig);
