import { createHash } from "node:crypto";
import { normalizeName } from "@mesa/shared";

/**
 * Índice de nomes: a chave é um hash estável do nome normalizado.
 * Isso deixa a verificação O(1) e evita varrer a lista inteira a cada cadastro.
 */
export class NameIndex {
  private keys = new Set<string>();

  static key(name: string): string {
    return createHash("sha256").update(normalizeName(name)).digest("hex");
  }

  load(names: string[]): void {
    this.keys = new Set(names.map((n) => NameIndex.key(n)));
  }

  has(name: string): boolean {
    return this.keys.has(NameIndex.key(name));
  }

  add(name: string): void {
    this.keys.add(NameIndex.key(name));
  }

  remove(name: string): void {
    this.keys.delete(NameIndex.key(name));
  }

  size(): number {
    return this.keys.size;
  }
}
