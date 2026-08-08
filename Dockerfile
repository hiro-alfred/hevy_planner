# Self-hosted deployment image (see knowledge/decisions/product-architecture.md:
# a persistent server, not serverless — SQLite on a mounted volume needs one).
#
# Multi-stage: dependencies and the build stay out of the final image, which
# ships only Next's standalone output plus what it needs at runtime.

# ---- deps -------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# better-sqlite3 ships prebuilt binaries for this platform, so no compiler is
# needed. --ignore-scripts keeps it from trying to build from source anyway.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ---- build ------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runtime ----------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_PATH=/data/hevy-planner.sqlite

# Never run the app as root: the database file and the API key it holds should
# be readable by exactly one account.
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs \
 && mkdir -p /data && chown nextjs:nodejs /data

# Standalone output carries its own minimal node_modules and server.js.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

# Migrations are applied on boot by src/instrumentation.ts, which reads this
# folder relative to the working directory — so it has to be in the image.
COPY --from=build --chown=nextjs:nodejs /app/drizzle ./drizzle

USER nextjs

# The database lives on a volume; without one, every deploy starts empty and
# the stored Hevy key and plans are lost.
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
