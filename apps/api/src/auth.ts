import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { config } from "./config.js";

const secret = new TextEncoder().encode(config.jwtSecret);

export function hashPassword(password: string, salt: string): string {
  return createHash("sha256").update(salt + password).digest("hex");
}

export function newSalt(): string {
  return randomBytes(16).toString("hex");
}

export async function signToken(userId: number, name: string): Promise<string> {
  return new SignJWT({ name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(config.jwtTtl)
    .sign(secret);
}

export async function verifyToken(
  token: string,
): Promise<{ userId: number; name: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    const userId = Number(payload.sub);
    const name = String(payload.name ?? "");
    if (!userId || !name) return null;
    return { userId, name };
  } catch {
    return null;
  }
}

export function bearerToken(header?: string): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}
