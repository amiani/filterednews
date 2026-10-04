FROM node:22-slim

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
# --ignore-scripts skips the dev-only effect-tsgo postinstall patch.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

COPY src ./src

ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
USER node
CMD ["node", "src/main.ts"]
