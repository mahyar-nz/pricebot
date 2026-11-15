FROM node:24-bookworm-slim
RUN npm install -g pnpm@11.25.0
WORKDIR /app
COPY . .
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
RUN pnpm install --frozen-lockfile && pnpm build
RUN cp -r apps/web/public apps/web/.next/standalone/apps/web/public && cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static
ENV NODE_ENV=production
USER node
CMD ["node", "apps/api/dist/main.js"]
