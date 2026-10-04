FROM node:22-bookworm-slim
ENV PNPM_HOME=/pnpm
ENV COREPACK_HOME=/pnpm/corepack
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.34.4 --activate
COPY --chown=node:node . .
RUN pnpm install --frozen-lockfile && pnpm build && pnpm store prune && chown -R node:node /pnpm apps/web/.next
ENV NODE_ENV=production
USER node
EXPOSE 3000 3001
CMD ["pnpm", "--filter", "@prism/web", "start"]
