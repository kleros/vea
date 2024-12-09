FROM node:20.12.1-alpine

WORKDIR /

COPY package.json ./

RUN yarn install

COPY . .

ENV INFURA_ID=""
RUN test -n "$INFURA_ID" || (echo "INFURA_ID must be set" && false)

COPY start-forks.sh /start-forks.sh

RUN chmod +x /start-forks.sh

EXPOSE 8545 8546

CMD ["/bin/sh", "/start-forks.sh"]
