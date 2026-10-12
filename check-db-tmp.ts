import { prisma } from './src/lib/db'

async function main() {
  const orgCount = await prisma.organization.count()
  const userCount = await prisma.user.count()
  const users = await prisma.user.findMany({ select: { email: true, name: true }, take: 5 })
  console.log('Organizations:', orgCount)
  console.log('Users:', userCount)
  console.log('Sample users:', JSON.stringify(users))
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
