FROM node:20-slim

WORKDIR /app

# A browser for drawing story pages and photographing source pages
# (lib/story/hcti.js): Chromium with Persian/Arabic and emoji fonts. Free and
# unlimited, unlike the HCTI service it replaces. ffmpeg makes the hand editor's filmstrip
# (lib/editing/filmstrip.js).
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium ffmpeg fonts-noto-core fonts-noto-color-emoji ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV CHROMIUM_PATH=/usr/bin/chromium

# Install dependencies
COPY package*.json ./
RUN npm install

# The headless build of Chromium for the same work (lib/story/hcti.js): about half the memory of the
# full browser above, which stays for its system libraries and as the fallback. A failed download
# never fails the build.
ENV HEADLESS_SHELL_DIR=/opt/pw
RUN PLAYWRIGHT_BROWSERS_PATH=/opt/pw npx playwright-core install chromium-headless-shell || echo "headless shell not installed, Chromium will be used"

# Build the Next.js app
COPY . .
RUN npm run build

# glibc gives every thread its own memory arena, which a 512 MB server pays for in memory it never
# gets back (sharp, ffmpeg and the model calls all run on threads): two arenas keep it flat.
ENV MALLOC_ARENA_MAX=2

ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

# ANTHROPIC_API_KEY must be provided at runtime (never baked into the image)
CMD ["npm", "start"]
