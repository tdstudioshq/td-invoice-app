FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY lib ./lib
COPY worker ./worker
COPY public/assets/cutlines ./public/assets/cutlines
USER node
CMD ["node", "--import=tsx", "worker/run.mts"]
