FROM node:20-alpine3.20
WORKDIR /urs/app/src/
COPY package.json ./
RUN npm install
COPY . .
EXPOSE 3000