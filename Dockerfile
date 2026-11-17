FROM node:20-bookworm-slim

# bedrock-protocol currently pulls a native RakNet module. Railway's slim
# Node image does not include the C/C++ toolchain needed to compile it.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       python3 \
       make \
       g++ \
       cmake \
       pkg-config \
       git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
