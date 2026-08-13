# Build stage: compile the React frontend with Vite.
FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY pussalla-frontend/package.json pussalla-frontend/package-lock.json* ./
RUN npm ci
COPY pussalla-frontend/ ./
RUN npm run build

# Backend stage: install prod deps and run the API + serve the built frontend.
FROM node:22-alpine AS backend
WORKDIR /app
COPY pussalla-backend/package.json pussalla-backend/package-lock.json* ./
RUN npm ci --omit=dev
COPY pussalla-backend/src ./src
COPY --from=frontend-build /app/frontend/dist ./pussalla-frontend/dist
ENV NODE_ENV=production
ENV SERVE_FRONTEND=true
ENV PORT=4000
EXPOSE 4000
CMD ["node", "src/server.js"]
