const chp = require('chainpoint-client');
const crypto2 = require('crypto2');
const hexToBinary = require('hex-to-binary');
const bigInt = require("big-integer");
const IPFS = require('ipfs');
const simpledb = require('./simpledb.js');
const utilsLib = require('./utils.js');
var utils = new utilsLib("TEST");
const agent = require("./agent.js");
const chaos = require("./chaos.js");
var assert = require('assert');


async function createAgent() {
  var agentInstance = new agent();
  await agentInstance.initialize();
  return agentInstance;
}

async function checkBlacklist(IPFSNode, thisAgent, thisMessage) {
  //NEED TO CONSIDER PULLING HISTORY
  var {shouldBlacklist, parsedMessage} = await utils.parseMessage(thisMessage[0], thisMessage[1]); //should never be blacklist for self
  if (shouldBlacklist) {
    thisAgent.db.addBlacklistPeer(shouldBlacklist);
    return true;
  }

  if (!parsedMessage) {
    return false;
  }

  var {shouldBlacklist, historyPull, shouldBroadcast} = thisAgent.db.addMessage(parsedMessage);

  if (shouldBlacklist) {
    thisAgent.db.addBlacklistPeer(shouldBlacklist);
    return true;
  }

  //pull history -> if message in DB should check to make sure same owner
  var shouldBlacklist = await utils.pullHistory(IPFSNode, thisAgent.db, parsedMessage.publicKey, historyPull);
  if (shouldBlacklist) {
    thisAgent.db.addBlacklistPeer(shouldBlacklist);
    return true;
  }

  return false;
}

async function performTest(IPFSNode) {

  var thisAgent = await createAgent();
  console.log("GOOD AGENT:", thisAgent.publicKey);

  var chaosAgent = new chaos(await createAgent(), utils);


  //simulate 10 rounds
  //can choose to send (be honest or malicious) or not
  //probability that any agent is chosen to process messages created in round
  var createdMessages = [];
  var y = 0;
  while (y < 10) {
    var urlToSend = await thisAgent.getRandomURL();
    var ratingToGive = thisAgent.getRating();
    if (urlToSend != null) {
      console.log("Agent:", urlToSend, "Rating:", ratingToGive, "Risk Score:", thisAgent.db.getURLRiskScore(urlToSend));
      const {IPFSHash, messageContents} = await utils.createMessage(IPFSNode, urlToSend, ratingToGive, thisAgent.lastMessageIPFS, thisAgent.publicKey, thisAgent.privateKey);
      thisAgent.lastMessageIPFS = IPFSHash;
      const {shouldBlacklist, parsedMessage} = await utils.parseMessage(IPFSHash, messageContents); //should never be blacklist for self
      thisAgent.db.addMessage(parsedMessage);
      createdMessages.push([IPFSHash, messageContents]); //broadcast



      chaosAgent.observeMessage(messageContents);
    }
    y += 1;
  }

  await checkBlacklist(IPFSNode, thisAgent, await chaosAgent.createValidMessage(IPFSNode));

  const backupString = await thisAgent.db.backupDB()


  //BAD NONCE
  assert(await checkBlacklist(IPFSNode, thisAgent, await chaosAgent.createBadNonceMessage(IPFSNode)));
  await thisAgent.db.restoreDB(backupString);

  //BAD RATING
  assert(await checkBlacklist(IPFSNode, thisAgent, await chaosAgent.createBadRatingMessage(IPFSNode)));
  await thisAgent.db.restoreDB(backupString);

  //BAD PROOF
  assert(await checkBlacklist(IPFSNode, thisAgent, await chaosAgent.createBadProofMessage(IPFSNode)));
  await thisAgent.db.restoreDB(backupString);

  //DUPLICATE RATING
  assert(await checkBlacklist(IPFSNode, thisAgent, await chaosAgent.createDuplicateRatingMessage(IPFSNode)));
  await thisAgent.db.restoreDB(backupString);

  //HISTORY MUTATION
  assert(await checkBlacklist(IPFSNode, thisAgent, await chaosAgent.createHistoryMutationMessage(IPFSNode)));
  await thisAgent.db.restoreDB(backupString);

  //COPIED INTERIOR MESSAGE
  assert(await checkBlacklist(IPFSNode, thisAgent, await chaosAgent.createCopyInteriorMessage(IPFSNode)));
  await thisAgent.db.restoreDB(backupString);

  //STEAL HISTORY
  assert(await checkBlacklist(IPFSNode, thisAgent, await chaosAgent.createStealHistoryMessage(IPFSNode)));
  await thisAgent.db.restoreDB(backupString);

  //UNREACHABLE IPFS ADDRESS (no way to know if valid and unreachable or unreachable -> should not mark as blacklist)
  assert(await checkBlacklist(IPFSNode, thisAgent, await chaosAgent.createUnreachableIPFSAddress(IPFSNode)) == false);
  await thisAgent.db.restoreDB(backupString);

  //Invalid IPFS ADDRESS (should be blacklist)
  assert(await checkBlacklist(IPFSNode, thisAgent, await chaosAgent.createInvalidIPFSAddress(IPFSNode)));
  await thisAgent.db.restoreDB(backupString);

  console.log("************CHAOS TESTING SUCCESSFUL************");

  process.exit();


}

console.log("Loading IPFS Node....")
const node = new IPFS({
  EXPERIMENTAL:{ pubsub: true},
  // relay:{enabled:true, hop:{enabled:true}},
  config: {
    Addresses: {
      Swarm: [
        "/dns4/ws-star.discovery.libp2p.io/tcp/443/wss/p2p-websocket-star"
      ]
    }
  }
});

node.on('ready', async () => {
  performTest(node);
});

node.on('error', async () => {
  console.log("**********ERROR************")
  console.log("NO INTERNET CONNECTION DETECTED!");
});
