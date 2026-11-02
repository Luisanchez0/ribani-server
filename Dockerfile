# syntax=docker/dockerfile:1
# Imagen de producción del backend RIBANI (NestJS + Prisma 7).
# Se construye desde la raíz del repo: docker build -t ribani-server .

FROM node:24-bookworm-slim AS build
WORKDIR /app

# Prisma detecta la versión de OpenSSL al generar el cliente.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Red doméstica inestable: reintentos antes de abortar la instalación.
ENV NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_MAXSOCKETS=4

# El cliente Prisma se genera en el prebuild y su URL solo se valida, no se usa:
# un valor ficticio evita filtrar DIRECT_URL/credenciales dentro de la imagen.
ARG DIRECT_URL="postgresql://build:build@localhost:5432/build"
ENV DIRECT_URL=$DIRECT_URL

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma7.config.ts ./
# Caché de npm entre builds: los reintentos no vuelven a descargar lo ya bajado.
RUN --mount=type=cache,target=/root/.npm npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
COPY certs ./certs
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Solo lo que necesita el proceso: node_modules podado con `npm prune --omit=dev`,
# dist (con el cliente Prisma compilado) y la CA de Supabase.
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/certs ./certs

USER node
EXPOSE 3000
CMD ["node", "dist/main"]
