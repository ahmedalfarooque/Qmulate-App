# `apps/mobile` — QMULATE portal (Expo)

The client/beneficiary portal. **Phase 2** — scaffolded from day one so the monorepo, the shared
i18n package and RTL are exercised early, but it contains no product features yet.

## What exists

A single screen (`App.tsx`) that renders the app name from `@qmulate/i18n` with RTL enabled.
That is the whole app. It proves the workspace wiring, the i18n boundary, and Arabic-first
direction handling — nothing more.

## It is NOT part of the build

This package defines only **`lint`** and **`typecheck`**. It has **no `build` script**, so
`turbo run build` skips it entirely and **CI never invokes EAS**. Native builds are a Phase-2
concern with their own credentials, provisioning and release process; wiring them into the
pipeline now would slow every CI run for an app nobody ships.

Run it locally with `pnpm --filter mobile start` (needs Expo Go or a simulator).

## Two deliberate deviations from the monorepo conventions

1. **`"type": "commonjs"`, not `"type": "module"`.** Metro loads `babel.config.js`
   *synchronously*, and Babel supports ESM config files only asynchronously — an ESM
   `babel.config.js` breaks `expo start`. This is the one package where the convention has to
   bend to the toolchain.
2. **No design tokens.** `@qmulate/ui` ships tokens as CSS custom properties, which React Native
   cannot read. The screen is therefore layout-only: no colours, no shadows. Porting the palette
   — and deciding how neumorphic depth should translate to native elevation, which is a design
   decision, not a mechanical one — is Phase-2 work.

## Known gaps for whoever picks Phase 2 up

- **Entry point.** `main` is `expo/AppEntry.js`. Recent Expo templates instead ship an
  `index.js` that calls `registerRootComponent(App)`. If `expo start` cannot find the entry,
  add that file — it was outside this sprint's file set.
- **No icon, splash, or EAS project id** in `app.json`, and the bundle identifier
  (`sa.qmulate.portal`) is a placeholder registered with nobody.
- **RTL needs a reload.** `I18nManager.forceRTL` only fully applies after a restart on native.
  A locale switcher will need an explicit reload prompt (`expo-updates`' `reloadAsync`).
- **No navigation, no auth, no API client.** The tRPC client, better-auth session handling and
  `expo-secure-store` token storage all land with the portal epic.
