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


function messageSent(IPFSHash, messageIndex) {

}


node.on('ready', async () => {
  // conf.delete('db');
  conf.delete('messageIndex');
  conf.delete('lastIPFS');



  const {publicKey, privateKey} = await getKeys();

  const timeoutLimit = 60;
  var dbObject = new db(node, privateKey, async (newBackupAddress) => {
    console.log("Database Backup:", newBackupAddress);
    //TODO: set conf for new db
    conf.set('db', newBackupAddress);
  }, timeoutLimit);


  let backupFound = await dbObject.restoreDatabase(conf.get('db')); //(null);
  console.log("Database Restored:",backupFound);
  await dbObject.backupDatabase();

  var messagesObject = new messages(node, publicKey, privateKey, null, null, (IPFSHash, messageIndex) => {
    console.log("Message Sent:", IPFSHash, messageIndex);
    //TODO: set conf for new messageIndex and lastIPFS
  }, timeoutLimit);
  messagesObject.createMessageQueue("url1", 1);
  // messagesObject.createMessageQueue("url2", 1);
  // messagesObject.createMessageQueue("url3", 1);
  // messagesObject.createMessageQueue("url4", 1);
  // messagesObject.createMessageQueue("url5", 1);

  // try {
  //   let IPFSText = await messagesObject.getPreviousMessage("QmaZMQHLyZsUiZnpZ118NL3jEZas9RKSw1wvXaYdZofpVn");
  //   console.log("IPFS Text:", IPFSText);
  //   const parsedMessage = await messagesObject.parseMessage(IPFSText);
  //   console.log("Parsed Message:", parsedMessage);
  //   dbObject.processMessageQueue(parsedMessage, false);
  // } catch {
  //   console.log("Invalid Proof or IPFS Text!");
  // }

  //
  // var i = 0
  // while (i < 10) {
  //   dbObject.processMessageQueue(i, false);
  //   i += 1;
  // }
  //
  // console.log("Done spawning messages");
  //
  // setTimeout(() => {
  //   i = 10
  //   while (i < 20) {
  //     dbObject.processMessageQueue(i, false);
  //     i += 1;
  //   }

  // }, 1000 * 10);
});
