import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * The gate on every /admin page.
 *
 * Until now nothing checked the role before rendering these: the middleware only asks
 * whether you are signed in, the navigation merely hides the links, and each page is a
 * client component that fetches its data afterwards. So any signed-in contractor who
 * typed /admin/users got the screen — the figures stayed empty because every admin API
 * checks properly, but the tooling was on show and the whole thing rested on no admin
 * route ever forgetting its own check.
 *
 * One guard here covers the lot, and covers pages added later without anyone having to
 * remember. Pages outside this tree that need their own rule — /approvals, /accounts —
 * still carry it themselves, because their rule is not "is an admin".
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect('/auth/signin?callbackUrl=/admin');
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });

  if (user?.role !== 'admin' && user?.role !== 'superadmin') {
    // Not /dashboard — that is admin-only too, so a contractor would bounce twice.
    redirect('/contracts');
  }

  return <>{children}</>;
}
