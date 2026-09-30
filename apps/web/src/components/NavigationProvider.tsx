'use client';

import { createContext, useContext } from 'react';

import type { ReactNode } from 'react';

/**
 * What the signed-in person may SEE in the sidebar, computed once on the server from their seats
 * and their organisation permissions (`whoami.sections`) and handed to the client shell. This is
 * visibility only: every page and every API procedure behind a section enforces its own
 * permission. A missing provider (a page rendered outside the app layout) shows nothing but the
 * dashboard, which is the fail-closed default.
 */
export interface NavigationState {
  readonly sections: readonly string[];
  readonly isPrimaryAdmin: boolean;
  readonly accessLevelKey: string | null;
}

const NavigationContext = createContext<NavigationState>({
  sections: ['dashboard'],
  isPrimaryAdmin: false,
  accessLevelKey: null,
});

export function NavigationProvider({ value, children }: { value: NavigationState; children: ReactNode }) {
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationState {
  return useContext(NavigationContext);
}
