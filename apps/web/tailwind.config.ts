import preset from '@qmulate/ui/tailwind-preset';

import type { Config } from 'tailwindcss';

/**
 * Every colour, shadow, radius, z-index and type step comes from the shared preset, which
 * resolves to the `--color-*` / `--nu-*` / `--glass-*` custom properties in
 * `@qmulate/ui/tokens/tokens.css`. Nothing is redefined here — an app-level override would
 * silently break the dark-neu and flat-report themes, which swap the same token names.
 */
const config: Config = {
  presets: [preset],
  content: [
    './src/**/*.{ts,tsx}',
    // Components shipped as source by the design-system package (JIT packages pattern).
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};

export default config;
