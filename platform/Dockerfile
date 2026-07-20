# Canada Visa Platform — production image
# Build:  docker build -t canada-visa-platform .
# Run:    docker run -p 3000:3000 -v visa-data:/data \
#           -e ANTHROPIC_API_KEY=... -e AUTH_SECRET=... canada-visa-platform

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Applicant data lives under /data — mount a persistent volume there.
ENV DATA_DIR=/data/store
ENV UPLOAD_DIR=/data/uploads

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

RUN mkdir -p /data/store /data/uploads
EXPOSE 3000
CMD ["node", "server.js"]
