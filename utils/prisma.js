import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis
const prisma = globalForPrisma.__arcadiaPrisma || new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.__arcadiaPrisma = prisma

export default prisma
