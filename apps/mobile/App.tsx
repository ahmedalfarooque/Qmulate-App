/**
 * QMULATE portal — Phase-2 scaffold.
 *
 * One screen, existing to prove three things hold before any feature is built on top:
 * 1. the app **typechecks** inside the monorepo and resolves workspace packages;
 * 2. every visible string comes from `@qmulate/i18n` — nothing is hard-coded here;
 * 3. **RTL is on from the first commit**, because Arabic is the product default, not a
 *    localisation added later.
 *
 * Deliberately unstyled beyond layout: the design tokens live in `@qmulate/ui` as CSS custom
 * properties, which React Native cannot consume. Porting the palette — and deciding how
 * neumorphic depth should translate to native elevation — is Phase-2 work, so this screen
 * commits to no colour rather than hardcoding a hex that would later contradict the token set.
 */

import { StatusBar } from 'expo-status-bar';
import type { JSX } from 'react';
import { I18nManager, StyleSheet, Text, View } from 'react-native';

import { defaultLocale, getDirection, getMessages, type Locale } from '@qmulate/i18n';

const locale: Locale = defaultLocale;
const direction = getDirection(locale);
const isRtl = direction === 'rtl';
const t = getMessages(locale);

// Must run before the first render. `forceRTL` only takes full effect on the native side after a
// reload, which is why it is set at module scope rather than inside a component.
I18nManager.allowRTL(true);
if (I18nManager.isRTL !== isRtl) {
  I18nManager.forceRTL(isRtl);
}

export default function App(): JSX.Element {
  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <Text accessibilityRole="header" style={styles.title}>
        {t.common.appName}
      </Text>
      {/* Machine codes, not prose — a build-time sanity readout, never user-facing copy. */}
      <Text style={styles.caption}>{`${locale} · ${direction}`}</Text>
    </View>
  );
}

// Logical/symmetric styles only: no `left`, `right`, `marginLeft` or `paddingRight` anywhere, so
// the layout mirrors correctly under RTL. `textAlign: 'auto'` follows the writing direction.
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
    textAlign: 'auto',
    writingDirection: isRtl ? 'rtl' : 'ltr',
  },
  caption: {
    marginTop: 8,
    fontSize: 13,
    textAlign: 'auto',
  },
});
