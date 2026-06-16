const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const billId = 'cmq1zt0jh000jl104i1g4nddi';
  console.log(`--- Inspecting Bill and Approval History: ${billId} ---`);

  const history = await prisma.billApprovalHistory.findMany({
    where: { billId: billId },
    orderBy: { timestamp: 'asc' }
  });

  console.log('\n--- Approval History ---');
  if (history.length === 0) {
    console.log('No history found.');
  } else {
    for (const h of history) {
      const u = await prisma.user.findUnique({ where: { id: h.userId }, select: { name: true, role: true } });
      console.log(`- Action: ${h.action} | Prev: ${h.previousStatus} | New: ${h.newStatus} | Comments: ${h.comments} | By: ${u?.name} (${u?.role}) | At: ${h.timestamp}`);
    }
  }

  process.exit(0);
}

run().catch(console.error);
