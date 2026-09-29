/**
 * QMULATE — ESLint config for `apps/mobile` (Expo scaffold, Phase 2 features).
 *
 * Same gap as `packages/ui`: without this file ESLint resolved the root config and the
 * design-system restrictions (physical CSS, raw hex, hand-rolled shadows) never ran here.
 * The portal is where neumorphism is richest, so it is the last place those rules should be off.
 */
export { default } from '@qmulate/config/eslint/react';
