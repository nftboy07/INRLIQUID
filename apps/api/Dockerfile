FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/adapters/package.json packages/adapters/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm -r build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/packages/domain/package.json packages/domain/package.json
COPY --from=build /app/packages/domain/dist packages/domain/dist
COPY --from=build /app/packages/adapters/package.json packages/adapters/package.json
COPY --from=build /app/packages/adapters/dist packages/adapters/dist
RUN pnpm install --prod --frozen-lockfile
USER node
EXPOSE 3001
CMD ["node","apps/api/dist/server.js"]
