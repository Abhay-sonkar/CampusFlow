# ---------- Stage 1: build ----------
# Installs everything (including TypeScript) and compiles src/ into dist/.
# This stage is thrown away afterwards, so none of its tools end up in the final image.
FROM node:24-slim AS build
WORKDIR /app

# Copy the dependency lists first: Docker caches this layer, so `npm ci` only re-runs
# when package.json or package-lock.json change, not on every code edit.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build


# ---------- Stage 2: runtime ----------
# Only production dependencies and the compiled code: smaller and safer.
FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/dist ./dist

# Uploaded files are written here; compose keeps this folder in a volume so they survive restarts
RUN mkdir -p uploads && chown -R node:node /app
USER node

EXPOSE 5000

# Docker asks the API "are you alive?" every 15 seconds.
# (The worker container switches this off: it has no web server.)
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# The API. The worker runs the same image with:  node dist/worker.js
CMD ["node", "dist/server.js"]
