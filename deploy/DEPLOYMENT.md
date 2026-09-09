# Deploying MeghaSales CRM to EC2 with Docker

Stack: Next.js 14 app + self-managed Postgres, both in Docker, behind host
Nginx for SSL. File storage stays on Vercel Blob (works from any host).
Reminder crons run from the host crontab against the app's existing
`CRON_SECRET`-protected routes.

## 1. Launch the EC2 instance

- Ubuntu 22.04 LTS, t3.small or larger (t3.micro will be tight once Postgres
  is running alongside the app).
- Security group: allow inbound 22 (SSH, ideally restricted to your IP),
  80, 443. Do **not** open 3000 or 5432 — the app is reached only via
  Nginx, and Postgres only via the Docker network.
- Attach an Elastic IP so your DNS A record doesn't break on instance restart.
- Point your domain's A record at the Elastic IP.

## 2. Install Docker

```bash
ssh ubuntu@your-instance
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
sudo apt-get update && sudo apt-get install -y docker-compose-plugin nginx certbot python3-certbot-nginx
```

## 3. Get the code onto the instance

```bash
git clone <your-repo-url> meghasales && cd meghasales
# or: scp/rsync the project folder up if it's not in git yet
```

## 4. Configure environment

```bash
cp .env.example .env.production
nano .env.production   # fill in real secrets — see checklist below
```

Fill in, at minimum:
- `POSTGRES_PASSWORD` — strong, random
- `NEXTAUTH_URL` — `https://your-domain.com`
- `NEXTAUTH_SECRET`, `JWT_SECRET`, `CRON_SECRET` — `openssl rand -base64 32` each
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — `npx web-push generate-vapid-keys`
- `BLOB_READ_WRITE_TOKEN` — from the Vercel dashboard → Storage → create a
  Blob store (no need to deploy anything there, just provisioning storage)

**Also create a root `.env`** (separate from `.env.production` above — yes,
this is a second file). `docker-compose.yml` passes `POSTGRES_USER`,
`POSTGRES_PASSWORD`, `POSTGRES_DB`, and every `NEXT_PUBLIC_*` var as Docker
build `args`, and build args are resolved by Compose's own variable
substitution when it parses `docker-compose.yml` — which only reads a root
`.env` (or the shell environment), never `.env.production`. `.env.production`
via `env_file:` only reaches the already-running container, too late to
affect a `NEXT_PUBLIC_*` var that Next.js must inline into the client bundle
*at build time*. Concretely:

```bash
cat > .env << 'EOF'
POSTGRES_USER=meghasales
POSTGRES_PASSWORD=same-value-as-in-.env.production
POSTGRES_DB=meghasales
NEXT_PUBLIC_FEATURE_ADMIN_TICKET=true
NEXT_PUBLIC_FEATURE_MEETINGS=true
NEXT_PUBLIC_FEATURE_PAYROLL=true
NEXT_PUBLIC_VAPID_PUBLIC_KEY=same-value-as-in-.env.production
EOF
```

Any `NEXT_PUBLIC_*` flag missing or blank here silently renders as
`ENV NEXT_PUBLIC_FEATURE_X=""` in the built image — `=== 'true'` then
evaluates false and the nav item disappears with no error anywhere. If you
change a value in this file, you must `docker compose up -d --build` again
(a plain `up -d` won't pick it up, since it's already baked into the image).

## 5. Build and start the stack

```bash
docker compose up -d --build
docker compose logs -f app   # watch migrations run, then the server start
```

This brings up `postgres` (persistent volume, not publicly exposed),
`backup` (nightly `pg_dump` into `./backups`, 14-day retention), and `app`
(bound to `127.0.0.1:3000` only).

First run seeds nothing automatically — if this is a fresh database and you
want the demo/admin seed data:

```bash
docker compose exec app npx tsx prisma/seed.ts
```

## 6. Put Nginx in front + get SSL

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/meghasales
sudo nano /etc/nginx/sites-available/meghasales   # set your real domain
sudo ln -s /etc/nginx/sites-available/meghasales /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com   # issues cert, rewrites config for https
```

Certbot installs its own renewal timer — nothing further to do there.

## 7. Install the reminder crons

```bash
nano deploy/crontab.txt   # fill in your real domain + CRON_SECRET
crontab deploy/crontab.txt
crontab -l   # verify
```

## 8. Verify

- Visit `https://your-domain.com` — should redirect to `/login`.
- Log in with the seeded admin (`admin@tekfilo.com` / `admin123` if you
  ran the seed) and **change that password immediately**.
- `docker compose ps` — all three services healthy/running.
- `curl -I https://your-domain.com/api/accounting/reminders/generate` should
  return 401 (no bearer token) — confirms the route and TLS are both live.

## Day-2 operations

**Deploying updates:**
```bash
git pull
docker compose up -d --build   # rebuilds app, re-runs migrations on start, zero-touch on postgres
```

**Restoring from backup:**
```bash
gunzip -c backups/2026-08-28_060000.sql.gz | docker compose exec -T postgres psql -U $POSTGRES_USER -d $POSTGRES_DB
```

**Off-box backups:** the `backup` service writes to `./backups` on the EC2
instance's own disk, which protects you against container/data corruption
but not instance loss. For real disaster recovery, add a daily `aws s3 cp`
of that folder to a bucket (or an EBS snapshot schedule via AWS Backup).

**Watching logs:**
```bash
docker compose logs -f app
docker compose logs -f postgres
tail -f /var/log/meghasales-cron.log
```

## Why these choices

- **`output: 'standalone'`** (next.config.mjs) — Next.js emits a
  self-contained server bundle with a pruned node_modules, keeping the
  final Docker image small instead of shipping the whole dev node_modules tree.
- **`prisma migrate deploy` moved to `entrypoint.sh`, not the build step** —
  at `docker build` time there's no database to connect to yet (the
  `postgres` container doesn't exist until `docker compose up`). Migrations
  now run every time the `app` container starts, which is idempotent and
  matches how Prisma expects `migrate deploy` to be used in production.
- **Postgres only on the internal Docker network** — no `ports:` mapping
  to the host, so it's unreachable from the internet even if the security
  group were misconfigured. The app reaches it via the `postgres` hostname
  Docker Compose provides automatically.
- **Vercel Blob kept as-is** — it's a standalone storage API, not tied to
  Vercel hosting. Ripping it out for S3 would touch 7 route files for no
  functional benefit; can always be swapped later if you want to reduce
  vendor surface.
