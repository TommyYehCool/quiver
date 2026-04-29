FROM node:22-alpine

WORKDIR /app

# 先 copy package*.json 進來建立 cache layer
COPY package.json ./
RUN npm install

# Source code 在 docker-compose 透過 volume mount 進來
EXPOSE 3000

CMD ["npm", "run", "dev"]
