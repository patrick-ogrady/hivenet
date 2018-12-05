FROM node:10

# Create app directory
WORKDIR /usr/src/app

# Used to store files
RUN mkdir /var/log/hivenet

# Install Dependencies before npm install
RUN apt-get update
RUN apt-get install -y libsecret-1-dev

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

#EXPOSE SERVER
EXPOSE 3000

#EXPOSE IPFS SWARM
EXPOSE 4001

CMD [ "node", "index.js" ]
