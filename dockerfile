FROM node:21-alpine3.19
WORKDIR /urs/app/src/
COPY package.json ./
RUN npm install
COPY . .
EXPOSE 3000