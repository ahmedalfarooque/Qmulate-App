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
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };
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
