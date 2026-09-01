# syntax=docker/dockerfile:1

# ---- deps: install once, cached separately from source changes ----
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---- builder: generate Prisma client + Next.js build ----
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL isn't needed at build time (no migrate here), but Prisma's
# generator still wants the env var present to read schema.prisma cleanly.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* vars are inlined into the client bundle by `next build`
# below, not read at container runtime — env_file/environment in
# docker-compose.yml only reach the running container, never the build
# step. These three gate the Meetings/Payroll/Admin Ticket nav entries
# (see src/lib/*/featureFlag.ts) and MUST be passed as --build-arg (via
# docker-compose.yml's build.args, sourced from the compose-level .env —
# see deploy/DEPLOYMENT.md) or they silently build as disabled regardless
# of what .env.production sets.
ARG NEXT_PUBLIC_FEATURE_MEETINGS=false
ARG NEXT_PUBLIC_FEATURE_PAYROLL=false
ARG NEXT_PUBLIC_FEATURE_ADMIN_TICKET=false
ENV NEXT_PUBLIC_FEATURE_MEETINGS=$NEXT_PUBLIC_FEATURE_MEETINGS
ENV NEXT_PUBLIC_FEATURE_PAYROLL=$NEXT_PUBLIC_FEATURE_PAYROLL
ENV NEXT_PUBLIC_FEATURE_ADMIN_TICKET=$NEXT_PUBLIC_FEATURE_ADMIN_TICKET
RUN npm run build

# ---- runner: minimal image, only standalone output + static assets ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Prisma's query/migration engines need libssl to be present and detectable,
# which the base alpine image doesn't ship with.
RUN apk add --no-cache openssl

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Standalone server + full node_modules (from `deps`, not the standalone
# trace-pruned subset). This is slightly bigger than the minimal trace,
# but guarantees the Prisma CLI has every engine/wasm file it needs at
# container start - cherry-picking individual prisma paths here kept
# missing files Prisma only discovers it needs at runtime.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh && chown nextjs:nodejs ./entrypoint.sh

USER nextjs
EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "server.js"]
