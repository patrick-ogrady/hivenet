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


async function createAgent() {
  var agentInstance = new agent();
  await agentInstance.initialize();
  return agentInstance;
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
    var urlToSend = thisAgent.popUnseenURL();
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

  createdMessages.push(await chaosAgent.createValidMessage(IPFSNode));
  createdMessages.push(await chaosAgent.createBadNonceMessage(IPFSNode));
  createdMessages.push(await chaosAgent.createValidMessage(IPFSNode));
  createdMessages.push(await chaosAgent.createBadRatingMessage(IPFSNode));
  createdMessages.push(await chaosAgent.createValidMessage(IPFSNode));
  createdMessages.push(await chaosAgent.createBadProofMessage(IPFSNode));
  createdMessages.push(await chaosAgent.createValidMessage(IPFSNode));
  createdMessages.push(await chaosAgent.createDuplicateRatingMessage(IPFSNode));
  createdMessages.push(await chaosAgent.createValidMessage(IPFSNode));
  createdMessages.push(await chaosAgent.createHistoryMutationMessage(IPFSNode));
  createdMessages.push(await chaosAgent.createValidMessage(IPFSNode));
  createdMessages.push(await chaosAgent.createCopyInteriorMessage(IPFSNode));
  createdMessages.push(await chaosAgent.createValidMessage(IPFSNode));
  createdMessages.push(await chaosAgent.createStealHistoryMessage(IPFSNode));
  createdMessages.push(await chaosAgent.createValidMessage(IPFSNode));

  var shouldBlacklistCount = 0;
  while(createdMessages.length > 0) {
    thisAgent.db.clearBlacklist();
    var thisMessage = createdMessages.pop();

    //NEED TO CONSIDER PULLING HISTORY
    var {shouldBlacklist, parsedMessage} = await utils.parseMessage(thisMessage[0], thisMessage[1]); //should never be blacklist for self
    if (shouldBlacklist) {
      shouldBlacklistCount += 1;
      thisAgent.db.addBlacklistPeer(shouldBlacklist);
      continue;
    }

    if (!parsedMessage) {
      continue
    }

    var {shouldBlacklist, historyPull, shouldBroadcast} = thisAgent.db.addMessage(parsedMessage);

    if (shouldBlacklist) {
      shouldBlacklistCount += 1
      thisAgent.db.addBlacklistPeer(shouldBlacklist);
      continue
    }

    //pull history -> if message in DB should check to make sure same owner
    var shouldBlacklist = await utils.pullHistory(IPFSNode, thisAgent, parsedMessage.publicKey, historyPull);
    if (shouldBlacklist) {
      shouldBlacklistCount += 1
      thisAgent.db.addBlacklistPeer(shouldBlacklist);
      continue
    }
  }

  console.log("BLACKLIST COUNT:", shouldBlacklistCount); //SHOULD EQUAL 12 BECAUSE HISTORY SHOULD LEAD TO BLACKLIST AFTER CLEARING

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
  performTest(node);
});
