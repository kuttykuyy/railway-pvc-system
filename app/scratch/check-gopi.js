const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'gopichowdary86@gmail.com' },
    include: {
      customerAccount: true
    }
  });
  
  console.log('User record:', JSON.stringify(user, null, 2));
}

main()
  .catch(e => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
