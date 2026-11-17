// Class join codes, e.g. "K7QM2X". No 0/O or 1/I/L, so they're easy to read off a board.
import { randomInt } from "node:crypto";
import { db } from "./db";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newJoinCode() {
  return Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

export const normalizeJoinCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Gives the course a fresh unique code (retries on the rare collision). */
export async function assignJoinCode(courseId: string) {
  for (let i = 0; i < 5; i++) {
    try {
      const c = await db.course.update({ where: { id: courseId }, data: { joinCode: newJoinCode() }, select: { joinCode: true } });
      return c.joinCode!;
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e;
    }
  }
  throw new Error("Couldn't create a unique class code.");
}
