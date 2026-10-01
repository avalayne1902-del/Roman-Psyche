FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node backend ./backend
COPY --chown=node:node ai ./ai
COPY --chown=node:node safety ./safety
COPY --chown=node:node database ./database
COPY --chown=node:node frontend ./frontend
COPY --chown=node:node system_prompt.md ./system_prompt.md
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "backend/server.js"]
