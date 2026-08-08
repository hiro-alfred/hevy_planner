# Self-hosted deployment image (see knowledge/decisions/product-architecture.md:
# a persistent server, not serverless).
#
# This image is the APP ONLY. State lives in the MariaDB service defined in
# docker-compose.yml, so there is no volume here and DATABASE_URL must point at
# a reachable server — an app container started on its own has nowhere to write.
#
# Multi-stage: dependencies and the build stay out of the final image, which
# ships only Next's standalone output plus what it needs at runtime.

# ---- deps -------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# Every dependency is pure JS now that the database driver is mysql2, so there
# is nothing to compile. --ignore-scripts keeps install hooks out of the build.
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
    HOSTNAME=0.0.0.0

# Never run the app as root.
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# Standalone output carries its own minimal node_modules and server.js.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

# Migrations are applied on boot by src/instrumentation.ts, which reads this
# folder relative to the working directory — so it has to be in the image.
COPY --from=build --chown=nextjs:nodejs /app/drizzle ./drizzle

USER nextjs

EXPOSE 3000

# start-period covers the boot-time migration wait in src/lib/db/migrate.ts,
# which retries for up to 60s while MariaDB finishes coming up.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
