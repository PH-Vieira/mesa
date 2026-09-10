/** Redes privadas, loopback e Tailscale (CGNAT 100.64/10). */

function normalizeIp(ip: string): string {
  let value = ip.trim().toLowerCase();
  if (value.startsWith("::ffff:")) value = value.slice(7);
  if (value === "::1") return "127.0.0.1";
  return value;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((nums[0]! << 24) >>> 0) + (nums[1]! << 16) + (nums[2]! << 8) + nums[3]!;
}

function inCidr(ip: string, base: string, bits: number): boolean {
  const a = ipv4ToInt(ip);
  const b = ipv4ToInt(base);
  if (a == null || b == null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

export function isPrivateOrTailscaleIp(ip: string): boolean {
  const value = normalizeIp(ip);
  if (!value || value === "local" || value === "unknown") return true;
  if (value === "127.0.0.1") return true;
  // IPv6 ULA / link-local / loopback
  if (value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:")) return true;
  if (value.includes(":")) return false;
  if (inCidr(value, "10.0.0.0", 8)) return true;
  if (inCidr(value, "172.16.0.0", 12)) return true;
  if (inCidr(value, "192.168.0.0", 16)) return true;
  // Tailscale / Carrier-grade NAT
  if (inCidr(value, "100.64.0.0", 10)) return true;
  return false;
}

export function directClientIp(req: {
  ip?: string;
  socket?: { remoteAddress?: string };
  raw?: { socket?: { remoteAddress?: string } };
}): string {
  const raw =
    req.socket?.remoteAddress ||
    req.raw?.socket?.remoteAddress ||
    req.ip ||
    "";
  return normalizeIp(raw || "local");
}
