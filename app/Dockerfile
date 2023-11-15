FROM node:18.18.2-alpine as builder
WORKDIR /opt/app
COPY . .
RUN yarn install --frozen-lockfile
RUN yarn build

FROM node:18.18.2-alpine as runner
WORKDIR /opt/app
ENV NODE_ENV production

COPY --from=builder /opt/app/next.config.js ./
COPY --from=builder /opt/app/public ./public
COPY --from=builder /opt/app/.next ./.next
COPY --from=builder /opt/app/node_modules ./node_modules
COPY --from=builder /opt/app/package.json ./package.json
COPY --from=builder /opt/app/utils/tf-custom-realm-template.mustache ./utils/tf-custom-realm-template.mustache

EXPOSE 3000
CMD ["yarn", "start"]
