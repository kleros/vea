FROM node:20.12.1-alpine

WORKDIR /home/node

COPY package.json ./

RUN yarn install --ignore-scripts

COPY . .

ENV INFURA_API_KEY=""

RUN chmod +x /home/node/start-forks.sh

USER node

EXPOSE 8545 8546 8547

CMD ["/bin/sh", "/home/node/start-forks.sh"]
