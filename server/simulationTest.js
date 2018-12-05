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

//CONSTANTS
const SHOUD_ATTACK = true;

async function createAgent() {
  var agentInstance = new agent();
  await agentInstance.initialize();
  return agentInstance;
}

async function performTest(IPFSNode) {

  var agents = [];
  const numAgents = 2;
  var i;
  for (i = 0; i < numAgents; i++) {
    console.log("Agent:", i)
    var thisAgent = await createAgent();
    console.log(thisAgent.publicKey);
    agents.push(thisAgent);
  }

  var chaosAgent = new chaos(await createAgent(), utils);


  //simulate 10 rounds
  //can choose to send (be honest or malicious) or not
  //probability that any agent is chosen to process messages created in round
  var createdMessages = [];
  var y = 0;
  while (true) {
    var i;
    //send messages from honest agents
    for (i = 0; i < agents.length; i++) {
      var urlToSend = agents[i].getRandomURL();
      var ratingToGive = agents[i].getRating();
      if (urlToSend != null) {
        console.log("Agent:", i, urlToSend, "Rating:", ratingToGive, "Risk Score:", agents[i].db.getURLRiskScore(urlToSend));
        const {IPFSHash, messageContents} = await utils.createMessage(IPFSNode, urlToSend, ratingToGive, agents[i].lastMessageIPFS, agents[i].publicKey, agents[i].privateKey);
        agents[i].lastMessageIPFS = IPFSHash;
        const {shouldBlacklist, parsedMessage} = await utils.parseMessage(IPFSHash, messageContents); //should never be blacklist for self
        agents[i].db.addMessage(parsedMessage);
        createdMessages.push([IPFSHash, messageContents]); //broadcast



        chaosAgent.observeMessage(messageContents);
      }
    }

    if (SHOUD_ATTACK) {
      //send messages from malicious agent with valid signature
      createdMessages.push(await chaosAgent.createValidMessage(IPFSNode));
      if (Math.random() > 0.8) {
        createdMessages.push(await chaosAgent.createRandomBadMessage(IPFSNode));

        console.log("CREATING NEW MALICIOUS AGENT IDENTITY!");
        var chaosAgent = new chaos(await createAgent(), utils);

      }
    }

    //process messages (can choose to rebroadcast and add back to createdMessages)
    var messagesToBroadcast = [];
    while(createdMessages.length > 0) {
      var thisMessage = createdMessages.pop();
      var i;
      for (i = 0; i < agents.length; i++) {
        if (Math.random() > 0.5) {
          //check to see if already in history
          if (agents[i].db.checkMessageIPFS(thisMessage[0])) { //can avoid a lot of work
            console.log("ALREADY SEEN", thisMessage[0]);
            continue
          }


          //NEED TO CONSIDER PULLING HISTORY
          var {shouldBlacklist, parsedMessage} = await utils.parseMessage(thisMessage[0], thisMessage[1]); //should never be blacklist for self
          if (shouldBlacklist) {
            agents[i].db.addBlacklistPeer(shouldBlacklist);
            continue;
          }

          if (!parsedMessage) {
            continue
          }

          var {shouldBlacklist, historyPull, shouldBroadcast} = agents[i].db.addMessage(parsedMessage);

          if (shouldBlacklist) {
            agents[i].db.addBlacklistPeer(shouldBlacklist);
            continue
          }

          //pull history
          var shouldBlacklist = await utils.pullHistory(IPFSNode, agents[i].db, parsedMessage.publicKey, historyPull);

          if (shouldBlacklist) {
            agents[i].db.addBlacklistPeer(shouldBlacklist);
            continue
          }

          if (shouldBroadcast) {
            messagesToBroadcast.push(thisMessage);
          }
        }
      }
    }

    createdMessages = messagesToBroadcast;

    console.log("***********");
    var i;
    for (i = 0; i < agents.length; i++) {
      //get getPeerReputations
      console.log("Agent:", i);
      console.log("reputations:",agents[i].db.getPeerReputations());
      //get blacklisted peers
      console.log("blacklist:", agents[i].db.getAllBlacklistedPeers());

      //test backup
      var backupFile = await agents[i].db.backupDB();
      agents[i].db.restoreDB(backupFile);

      console.log("reputations:",agents[i].db.getPeerReputations());
      //get blacklisted peers
      console.log("blacklist:", agents[i].db.getAllBlacklistedPeers());

      console.log("+++++++++++++++");
    }

    console.log("Messages Re-Broadcasted:", createdMessages.length);
    console.log("***********","ROUND COMPLETE", y, "***********");
    console.log("\n\n");
    y += 1;


  }
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
