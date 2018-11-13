var db = require('./db');
var messages = require('./messages')
const IPFS = require('ipfs');
const crypto2 = require('crypto2');



async function getNewKeys() {
  console.log("CREATING KEY PAIRS");
  const { privateKey, publicKey } = await crypto2.createKeyPair();
  return {publicKey:publicKey, privateKey:privateKey};
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


//FIRST TEST JUST BETWEEN THREE PEERS 2 HONEST AND 1 BAD

node.on('ready', async () => {
  const timeoutLimit = 60;
  var {publicKey, privateKey} = await getNewKeys();

  console.log(publicKey, privateKey);

  var dbObject = new db(node, publicKey, privateKey, async (newBackupAddress) => {
    console.log("Database Backup:", newBackupAddress);
    //TODO: set conf for new db
    conf.set('db', newBackupAddress);
  }, timeoutLimit);

  await dbObject.restoreDatabase(null);

  var messagesObject = new messages(node, publicKey, privateKey, null, null, async (IPFSHash, messageIndex, messageSentText) => {
    console.log("Message Sent:", IPFSHash, messageIndex, messageSentText);
    //TODO: set conf for new messageIndex and lastIPFS

    //add messages to db for self in serial execution
    const parsedMessage = await messagesObject.parseMessage(messageSentText);
    console.log("Parsed Message:", parsedMessage);
    dbObject.processMessageQueue(parsedMessage, null);

  }, timeoutLimit);


  messagesObject.createMessageQueue("url1", 1);

  var {publicKey, privateKey} = await getNewKeys();

  console.log(publicKey, privateKey);

  var dbObject2 = new db(node, publicKey, privateKey, async (newBackupAddress) => {
    console.log("Database Backup:", newBackupAddress);
    //TODO: set conf for new db
    conf.set('db', newBackupAddress);
  }, timeoutLimit);

  await dbObject2.restoreDatabase(null);

  var messagesObject2 = new messages(node, publicKey, privateKey, null, null, async (IPFSHash, messageIndex, messageSentText) => {
    console.log("Message Sent:", IPFSHash, messageIndex, messageSentText);
    //TODO: set conf for new messageIndex and lastIPFS

    //add messages to db for self in serial execution
    const parsedMessage = await messagesObject2.parseMessage(messageSentText);
    console.log("Parsed Message:", parsedMessage);
    dbObject.processMessageQueue(parsedMessage, null);
    setTimeout(() => {
      dbObject2.processMessageQueue(parsedMessage, null);
    }, 10000);

  }, timeoutLimit);

  setTimeout(() => {
    messagesObject2.createMessageQueue("url1", 1);
  }, 10000);

});
