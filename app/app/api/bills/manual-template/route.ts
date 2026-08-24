import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { checkUserContractAccess } from '@/lib/permissions';
import { scheduleNames } from '@/lib/contract-schedules';
import { buildManualBillWorkbook } from '@/lib/manual-bill-sheet';

export const dynamic = 'force-dynamic';

/**
 * The spreadsheet to fill in when a bill cannot be read.
 *
 * Built per contract rather than offered as one blank file, because the schedule names
 * are the part nobody can guess: they belong to that agreement, and a schedule typed
 * from memory does not match the one the contract records, which is what the PVC
 * percentages hang off.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // The contract is OPTIONAL, on purpose.
  //
  // On the New Bill page the PDF is uploaded before any contract is chosen — it is
  // matched from the bill's own agreement number afterwards. So at the moment a read
  // fails there is usually no contract yet, and requiring one here hid this file at
  // exactly the moment it was the way out. Without one, the sheet lists every contract
  // on the account with its schedules, and the contract is picked in the app as usual.
  const contractId = request.nextUrl.searchParams.get('contractId');

  let contract: { agreementNo: string | null; workDescription: string | null; schedules: unknown } | null = null;
  if (contractId) {
    const access = await checkUserContractAccess(user.id, contractId);
    if (!access?.canView) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { agreementNo: true, workDescription: true, schedules: true },
    });
    if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Only needed when no contract was named. Bounded: a reference list, not an export.
  const others = contract ? [] : await prisma.contract.findMany({
    where: { userId: user.id },
    select: { agreementNo: true, workDescription: true, schedules: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const workbook = buildManualBillWorkbook(
    {
      agreementNo: contract?.agreementNo,
      workDescription: contract?.workDescription,
      scheduleNames: contract ? scheduleNames(contract.schedules) : [],
    },
    others.map(c => ({
      agreementNo: c.agreementNo,
      workDescription: c.workDescription,
      scheduleNames: scheduleNames(c.schedules),
    })),
  );

  const safeName = String(contract?.agreementNo || 'bill').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60);
  return new NextResponse(new Uint8Array(workbook), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Bill_items_${safeName}.xlsx"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
