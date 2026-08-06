/**
 * Pure, client-safe role helpers. Kept separate from `role-auth.ts` (which
 * imports prisma + next-auth for its server-side guards) so client components
 * can read role flags from the session without pulling the whole auth/DB chain
 * into the browser bundle.
 */
export function getClientRoleInfo(session: any) {
  return {
    isAdmin: session?.user?.role === 'admin' || session?.user?.role === 'superadmin',
    isRailwayOfficial: session?.user?.role === 'railway_official' || session?.user?.role === 'admin' || session?.user?.role === 'superadmin',
    isContractor: session?.user?.role === 'contractor' || session?.user?.role === 'admin' || session?.user?.role === 'superadmin',
    // The accounts/audit office, which vets a proposal after the executive approves it.
    isAccountsOfficial: session?.user?.role === 'accounts_official' || session?.user?.role === 'admin' || session?.user?.role === 'superadmin',
    role: session?.user?.role || 'contractor',
    email: session?.user?.email,
    designation: session?.user?.designation,
    department: session?.user?.department,
  };
}
