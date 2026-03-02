FROM node:18-bullseye-slim

WORKDIR /app

# install root dependencies (client uses root package.json)
COPY package.json package-lock.json* ./
RUN npm install --silent

# copy app
COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
