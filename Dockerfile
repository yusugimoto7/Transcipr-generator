FROM node:20-slim

WORKDIR /app

# A browser for drawing story pages and photographing source pages
# (lib/story/hcti.js): Chromium with Persian/Arabic and emoji fonts. Free and
# unlimited, unlike the HCTI service it replaces.
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-noto-core fonts-noto-color-emoji ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV CHROMIUM_PATH=/usr/bin/chromium

# Install dependencies
COPY package*.json ./
RUN npm install

# Build the Next.js app
COPY . .
RUN npm run build

ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

# ANTHROPIC_API_KEY must be provided at runtime (never baked into the image)
CMD ["npm", "start"]
