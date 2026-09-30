/**
 * The ONE decision the authenticated shell makes about an approved, enrolled account: does this
 * person get the application chrome, or a notice about their own account state?
 *
 * States are kept apart on purpose (they used to collapse into one refusal):
 *   · `shell`    — seated on an endowment, holding an organisation permission, OR assigned an
 *                  access level. A level IS an access assignment even when it confers no
 *                  organisation-wide permission (USER, CUSTOM) and no endowment exists yet to be
 *                  seated on: the person enters the application and sees the empty states, exactly
 *                  as production looks with zero endowments.
 *   · `no-seat`  — approved, but nobody has assigned anything yet: no level, no seat, no
 *                  permission. The notice says so and names the administrator as the fix.
 *
 * Pending, disabled and unauthenticated accounts never reach this function — the auth gate
 * answers them first — and NOTHING here widens what the kernel will actually read: every
 * endowment read stays seat-scoped on the server.
 */
export type ShellIdentity = {
  readonly grants: readonly unknown[];
  readonly org: {
    readonly permissions: readonly string[];
    readonly accessLevel: { readonly key: string } | null;
    readonly isPrimaryAdmin: boolean;
  };
};

export function shellDecision(identity: ShellIdentity): 'shell' | 'no-seat' {
  if (identity.org.isPrimaryAdmin) return 'shell';
  if (identity.grants.length > 0) return 'shell';
  if (identity.org.permissions.length > 0) return 'shell';
  if (identity.org.accessLevel !== null) return 'shell';
  return 'no-seat';
}
