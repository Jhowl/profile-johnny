# glibc base so better-sqlite3 uses its prebuilt binary (no compiler needed)
FROM node:22-bookworm-slim
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV DB_PATH=/app/data/chat.db
EXPOSE 3000
CMD ["node", "src/index.js"]
