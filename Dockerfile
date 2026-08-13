# Build stage: compile the React frontend with Vite and bundle it into
# pussalla-backend/public so the backend serves the SPA from one origin.
FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY pussalla-frontend/package.json pussalla-frontend/package-lock.json* ./
RUN npm ci
COPY pussalla-frontend/ ./
RUN npm run build

# Backend stage: install prod deps, copy the built frontend into public/.
FROM node:22-alpine AS backend
WORKDIR /app
# Copy scripts/ before npm ci so the postinstall hook (build-frontend.js) is
# present. It no-ops in Docker (no pussalla-frontend source here); the real
# frontend build comes from the frontend-build stage below.
COPY pussalla-backend/scripts ./scripts
COPY pussalla-backend/package.json pussalla-backend/package-lock.json* ./
RUN npm ci --omit=dev
COPY pussalla-backend/src ./src
COPY --from=frontend-build /app/dist ./public
ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000
CMD ["node", "src/server.js"]
