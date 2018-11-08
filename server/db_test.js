var db = require('./db');
var messages = require('./messages')
const Configstore = require('configstore');
const pkg = require('./package.json');
const conf = new Configstore(pkg.name);
const IPFS = require('ipfs');


async function getKeys() {
  if (conf.has('publicKey') == false) {
    console.log("CREATING KEY PAIRS");
    const { privateKey, publicKey } = await crypto2.createKeyPair();
    conf.set('publicKey', publicKey);
    conf.set('privateKey', privateKey);
    console.log("Public Key:", publicKey, "\n");
  } else {
    console.log("KEY PAIRS ALREADY EXIST");
  }

  return {publicKey:conf.get('publicKey'), privateKey:conf.get('privateKey')};
}

console.log("Loading IPFS Node....")
const node = new IPFS({
  EXPERIMENTAL:{ pubsub: true},
  relay:{enabled:true, hop:{enabled:true}},
  config: {
    Addresses: {
      Swarm: [
        "/dns4/ws-star.discovery.libp2p.io/tcp/443/wss/p2p-websocket-star"
      ]
    }
  }
});


node.on('ready', async () => {
  // conf.delete('db');

  const {publicKey, privateKey} = await getKeys();

  var dbObject = new db(node, conf);

  let backupFound = await dbObject.restoreDatabase();
  console.log("Database Restored:",backupFound);
  await dbObject.backupDatabase();
  console.log("Database Backed Up!");

  var i = 0
  while (i < 10) {
    dbObject.processMessageQueue(i, false);
    i += 1;
  }

  console.log("Done spawning messages");

  setTimeout(() => {
    i = 10
    while (i < 20) {
      dbObject.processMessageQueue(i, false);
      i += 1;
    }

  }, 1000 * 10);

  // var messagesObject = new messages(node, conf);
  // messagesObject.createMessageQueue("url1", 1);
  // messagesObject.createMessageQueue("url2", 1);
  // messagesObject.createMessageQueue("url3", 1);
  // messagesObject.createMessageQueue("url4", 1);
  // messagesObject.createMessageQueue("url5", 1);

  // let IPFSText = await messagesObject.getPreviousMessage("QmaZMQHLyZsUiZnpZ118NL3jEZas9RKSw1wvXaYdZofpVn");
  // console.log("IPFS Text:", IPFSText);
  // const status = await messagesObject.checkMessageFormat(IPFSText);
  // console.log("Get Status:", status);
  // try {
  //   let IPFSText = await messagesObject.getPreviousMessage("QmaZMQHLyZsUiZnpZ118NL3jEZas9RKSw1wvXaYdZofpVn");
  //   console.log("IPFS Text:", IPFSText);
  //   const status = await messagesObject.parseMessage(IPFSText);
  //   console.log("Get Status:", status);
  // } catch {
  //   console.log("Invalid IPFS Text!");
  // }
});
