FROM node:22-alpine

WORKDIR /app

# Build tools for better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install --omit=dev

COPY server.js importer.js ./
COPY public ./public
COPY seed ./seed

RUN mkdir -p /data
ENV DB_PATH=/data/emaus.db PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
