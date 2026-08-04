FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

# All credentials are supplied at runtime as environment variables — nothing
# secret is ever baked into the image.
CMD ["npm", "start"]
