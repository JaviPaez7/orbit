# ---------------------------------------------------------------------------
# Orbit — production container image.
#
# Multi-stage: build the workspace, then ship runtime artifacts + the Prisma
# runtime. SQLite is the default; set DATABASE_URL to PostgreSQL for a real
# deployment (see README → Deployment).
# ---------------------------------------------------------------------------

# ---- build -----------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

# Install with the lockfile so the image is reproducible.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/e2e/package.json apps/e2e/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ---- runtime ---------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/server/package.json apps/server/
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/server/prisma apps/server/prisma
COPY --from=build /app/apps/server/scripts apps/server/scripts
COPY --from=build /app/apps/server/prisma.config.ts apps/server/prisma.config.ts
COPY --from=build /app/apps/web/dist apps/web/dist

# Uploads are written here; mount a volume to persist them.
RUN mkdir -p apps/server/uploads

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Apply migrations, then start the API. Prisma Client is generated during
# install; the migration runner uses Node's built-in SQLite driver.
CMD ["sh", "-c", "pnpm --filter @orbit/server db:generate && pnpm --filter @orbit/server db:migrate && node apps/server/dist/index.js"]
