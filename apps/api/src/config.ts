import { STARTING_CHIPS } from "@mesa/shared";

export const config = {
  port: Number(process.env.PORT ?? 3333),
  jwtSecret: process.env.JWT_SECRET ?? "mesa-dev-secret-mude-em-producao",
  databasePath: process.env.DATABASE_PATH ?? "./data/mesa.db",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  startingChips: Number(process.env.STARTING_CHIPS ?? STARTING_CHIPS),
  jwtTtl: "14d" as const,
};
