# Stage 1: build the plugin
FROM node:20-alpine AS builder
WORKDIR /plugin
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Stage 2: Headlamp with the plugin baked in
FROM ghcr.io/headlamp-k8s/headlamp:latest
COPY --from=builder /plugin/dist /headlamp/plugins/sailor-view/
COPY --from=builder /plugin/package.json /headlamp/plugins/sailor-view/package.json
COPY .plugins/ai-assistant/main.js /headlamp/plugins/ai-assistant/main.js
COPY .plugins/ai-assistant/package.json /headlamp/plugins/ai-assistant/package.json
