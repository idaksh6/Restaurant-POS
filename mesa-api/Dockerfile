FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npx prisma generate || true
RUN npm run build || npx tsc -p tsconfig.json
EXPOSE 3001
CMD ["npm", "run", "start:dev"]
