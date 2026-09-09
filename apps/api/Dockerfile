FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN npm install --workspace=@mesa/api --include-workspace-root
WORKDIR /app/apps/api
ENV NODE_ENV=production
EXPOSE 3333
CMD ["npx", "tsx", "src/index.ts"]
