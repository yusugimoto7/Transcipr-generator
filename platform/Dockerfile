# Canada Visa Platform — production image
# Build:  docker build -t canada-visa-platform .
# Run:    docker run -p 3000:3000 -v visa-data:/data \
#           -e ANTHROPIC_API_KEY=... -e AUTH_SECRET=... canada-visa-platform
#
# Debian base (not Alpine) so the Python XFA form-filler deps (pikepdf/lxml)
# install from prebuilt wheels.

FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATA_DIR=/data/store
ENV UPLOAD_DIR=/data/uploads

# Python + IRCC XFA form-filler dependencies (isolated venv on PATH).
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv \
 && python3 -m venv /opt/venv \
 && /opt/venv/bin/pip install --no-cache-dir pikepdf==10.10.0 lxml==5.3.0 \
 && rm -rf /var/lib/apt/lists/*
ENV PATH="/opt/venv/bin:$PATH"

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# The Python filler + form assets are not traced by Next's standalone output,
# so copy them explicitly.
COPY --from=builder /app/lib/forms ./lib/forms

RUN mkdir -p /data/store /data/uploads
EXPOSE 3000
CMD ["node", "server.js"]
