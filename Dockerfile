FROM node:20-slim

WORKDIR /app

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
