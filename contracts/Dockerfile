FROM node:20.12.1-alpine

WORKDIR /

COPY package.json ./

RUN yarn install

COPY . .

COPY start-forks.sh /start-forks.sh

RUN chmod +x /start-forks.sh

EXPOSE 8545 8546

CMD ["/bin/sh", "/start-forks.sh"]
