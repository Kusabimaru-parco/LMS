import { PrismaClient } from "@prisma/client";

/**
 * Pictures are stored in the database. Leave the bytes out of every query by default so lists and
 * the signed-in user's record stay small; the routes that serve them select them explicitly.
 */
const createClient = () => new PrismaClient({ omit: { user: { avatar: true }, school: { logo: true } } });

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
