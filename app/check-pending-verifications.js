const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPendingVerifications() {
  try {
    const pendingTokens = await prisma.verificationToken.findMany({
      where: {
        expires: {
          gt: new Date() // Not yet expired
        }
      },
      include: {
        user: {
          select: {
            email: true,
            emailVerified: true
          }
        }
      }
    });

    console.log(`Found ${pendingTokens.length} pending verification tokens:`);
    pendingTokens.forEach(token => {
      console.log(`- Email: ${token.user.email}`);
      console.log(`  Verified: ${token.user.emailVerified ? 'Yes' : 'No'}`);
      console.log(`  Token: ${token.token.substring(0, 20)}...`);
      console.log(`  Expires: ${token.expires}`);
      console.log('');
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPendingVerifications();
