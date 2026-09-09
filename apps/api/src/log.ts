const dim = (s: string) => `\x1b[90m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

function stamp(): string {
  return new Date().toLocaleTimeString("pt-BR", { hour12: false });
}

function line(color: (s: string) => string, scope: string, message: string): void {
  console.log(`${dim(stamp())}  ${color(scope.padEnd(8))}  ${message}`);
}

export const log = {
  http(message: string) {
    line(cyan, "http", message);
  },
  ws(message: string) {
    line(cyan, "ws", message);
  },
  ok(scope: string, message: string) {
    line(green, scope, message);
  },
  info(scope: string, message: string) {
    line(dim, scope, message);
  },
  warn(scope: string, message: string) {
    line(yellow, scope, message);
  },
  err(scope: string, message: string) {
    line(red, scope, message);
  },
};
