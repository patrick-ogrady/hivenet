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

const express = require('express');
const bodyParser = require("body-parser");
var app = express();
app.use(bodyParser.json());

var updatesToGraph  = [];
var startIndex = 0;
app.get('/updates', async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  var lastIndex = updatesToGraph.length;

  res.status(200).json(updatesToGraph.slice(startIndex, lastIndex));
  startIndex = lastIndex;
  // console.log("New Start Index:", startIndex);

});

app.get('/', function(req, res) {
    res.sendfile(__dirname + '/viz.html');
});

//CONSTANTS
const PROBABILITY_CREATE_GOOD = 0.75;
const MAX_GOOD_AGENTS = 100;
const PROBABILITY_RECIEVE_MESSAGE = 0.75;
const PROBABILITY_CREATE_BAD = 0.75;
const MAX_BAD_AGENTS = 100;
const PROBABILITY_SEND_BLACKLISTABLE_MESSAGE = 0.01;
const AGENT_SIMILARITY = 0.9;//0.1;
const MALICIOUS_AGENT_PREDICT_USEFUL = 0.2;
const MALICIOUS_AGENT_TIME_SPENT_GUESSING_USEFUL = 0.5;

var publicKeyToAgent = {}
var agents = [];
var goodAgents = [];
var badAgents = [];
var edgeIDCount = 0;
var edgeObject = {}; //from-to as ""|"" key...value is edgeID

function findAgentID(agents, publicKey) {
  var i;
  for (i=0; i<agents.length; i++) {
    if (agents[i].publicKey == publicKey) {
      return i;
    }
  }
}

function createBlacklistAction(fromID, publicKey) {
  var thisAgentID = findAgentID(agents, publicKey);
  var edgeKey = fromID.toString() + "|" + thisAgentID.toString();
  if (edgeKey in edgeObject) {
    return ["modify edge", edgeObject[edgeKey], 1, true];
  } else {
    edgeObject[edgeKey] = edgeIDCount;
    edgeIDCount += 1;
    return ["create edge", edgeObject[edgeKey], fromID, thisAgentID, 1, true];
  }
}

function createReputationAction(fromID, publicKey, width) {
  // console.log("CREATE REPUTATION ACTION!!");
  var thisAgentID = findAgentID(agents, publicKey);
  var edgeKey = fromID.toString() + "|" + thisAgentID.toString();
  if (edgeKey in edgeObject) {
    return ["modify edge", edgeObject[edgeKey], width, false];
  } else {
    edgeObject[edgeKey] = edgeIDCount;
    edgeIDCount += 1;
    return ["create edge", edgeObject[edgeKey], fromID, thisAgentID, width, false];
  }
}

async function createAgent() {
  var agentInstance = new agent(AGENT_SIMILARITY);
  await agentInstance.initialize();
  return agentInstance;
}

async function performTest(IPFSNode) {
  updatesToGraph.push(["clean"]); //deletes store

  //simulate 10 rounds
  //can choose to send (be honest or malicious) or not
  //probability that any agent is chosen to process messages created in round
  var createdMessages = [];
  var y = 0;
  while (true) {
    //Consider Creating Good
    if (Math.random() < PROBABILITY_CREATE_GOOD && goodAgents.length <= MAX_GOOD_AGENTS) {
      var thisAgent = await createAgent();
      agents.push(thisAgent);
      goodAgents.push(agents.length - 1);
      publicKeyToAgent[thisAgent.publicKey] = agents.length - 1;
      console.log("Good Agent Created:", agents.length - 1);
      updatesToGraph.push(["create node", agents.length - 1, 'blue']);
    }

    //Consider Creating Bad
    if (Math.random() < PROBABILITY_CREATE_BAD && goodAgents.length > 0 && badAgents.length <= MAX_BAD_AGENTS) {
      var chaosAgent = new chaos(await createAgent(), utils, MALICIOUS_AGENT_PREDICT_USEFUL, MALICIOUS_AGENT_TIME_SPENT_GUESSING_USEFUL);
      agents.push(chaosAgent);
      badAgents.push(agents.length - 1);
      publicKeyToAgent[chaosAgent.agent.publicKey] = agents.length - 1;
      console.log("Bad Agent Created:", agents.length - 1);
      updatesToGraph.push(["create node", agents.length - 1, 'yellow']);
    }

    var thisRoundMessage = [];

    var k;
    //send messages from honest agents
    for (k = 0; k < goodAgents.length; k++) {
      var i = goodAgents[k];
      var urlToSend = await agents[i].getRandomURL();
      var ratingToGive = agents[i].getRating();
      if (urlToSend.includes("www.suspicious.com")) {
        updatesToGraph.push(["infected node", i]);
        ratingToGive = 0; //set bad rating since honest (so other peers won't get)
      }

      console.log("Agent:", i, urlToSend, "Rating:", ratingToGive, "Risk Score:", agents[i].db.getURLRiskScore(urlToSend));
      if(agents[i].db.checkIfAlreadyRated(agents[i].publicKey, utils.cleanURL(urlToSend))) {
        console.log("Already rated:", urlToSend);
        continue;
      }
      const {IPFSHash, messageContents} = await utils.createMessage(IPFSNode, urlToSend, ratingToGive, agents[i].lastMessageIPFS, agents[i].publicKey, agents[i].privateKey);
      agents[i].lastMessageIPFS = IPFSHash;
      const {shouldBlacklist, parsedMessage} = await utils.parseMessage(IPFSHash, messageContents); //should never be blacklist for self
      agents[i].db.addMessage(parsedMessage);
      createdMessages.push([IPFSHash, messageContents]); //broadcast
      //send messages from bad agents
      thisRoundMessage.push(messageContents);
    }

    var k;
    //send messages from bad agents
    for (k = 0; k < badAgents.length; k++) {
      var i = badAgents[k];
      for (messID in thisRoundMessage) {
        agents[i].observeMessage(thisRoundMessage[messID]);
      }
      var {toAppend, url} = await agents[i].createValidMessage(IPFSNode);
      createdMessages.push(toAppend);
      console.log("Bad Agent:", i, url);
      if (Math.random() < PROBABILITY_SEND_BLACKLISTABLE_MESSAGE) { //MOSTLY BE SUSPICIOUS
        updatesToGraph.push(["bad node", badAgents[badAgents.length-1]]);
        createdMessages.push(await chaosAgent.createRandomBadMessage(IPFSNode));
      }

    }

    //process messages (can choose to rebroadcast and add back to createdMessages)
    var messagesToBroadcast = [];
    while(createdMessages.length > 0) {
      var thisMessage = createdMessages.pop();
      var k;
      for (k = 0; k < goodAgents.length; k++) {
        var i = goodAgents[k];
        if (Math.random() > PROBABILITY_RECIEVE_MESSAGE) {
          //check to see if already in history
          if (agents[i].db.checkMessageIPFS(thisMessage[0])) { //can avoid a lot of work
            // console.log("ALREADY SEEN", thisMessage[0]);
            continue
          }


          //NEED TO CONSIDER PULLING HISTORY
          var {shouldBlacklist, parsedMessage} = await utils.parseMessage(thisMessage[0], thisMessage[1]); //should never be blacklist for self
          if (shouldBlacklist) {
            agents[i].db.addBlacklistPeer(shouldBlacklist);
            updatesToGraph.push(createBlacklistAction(i, shouldBlacklist));
            continue;
          }

          if (!parsedMessage) {
            continue
          }

          var {shouldBlacklist, historyPull, shouldBroadcast} = agents[i].db.addMessage(parsedMessage);

          if (shouldBlacklist) {
            agents[i].db.addBlacklistPeer(shouldBlacklist);
            updatesToGraph.push(createBlacklistAction(i, shouldBlacklist));
            continue
          }

          //pull history
          var shouldBlacklist = await utils.pullHistory(IPFSNode, agents[i].db, parsedMessage.publicKey, historyPull);

          if (shouldBlacklist) {
            agents[i].db.addBlacklistPeer(shouldBlacklist);
            updatesToGraph.push(createBlacklistAction(i, shouldBlacklist));
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
    var k;
    for (k = 0; k < goodAgents.length; k++) {
      var i = goodAgents[k];
      //get getPeerReputations
      console.log("Agent:", i);
      var peerRepsTotal = agents[i].db.getPeerReputations();
      var peerReps = peerRepsTotal.peerReputations;
      var totalRep = peerRepsTotal.totalReputation;

      var convertedReps = {};
      for (repKey in peerReps) {
        convertedReps[publicKeyToAgent[repKey]] = peerReps[repKey]/totalRep;
        updatesToGraph.push(createReputationAction(i, repKey, (peerReps[repKey]/totalRep) * 3));
      }
      console.log("reputations:", convertedReps);

      //get blacklisted peers
      var minimalBlacklist = [];
      var blacklistData = agents[i].db.getAllBlacklistedPeers();
      for (item in blacklistData) {
        minimalBlacklist.push(publicKeyToAgent[blacklistData[item].publicKey]);
      }
      console.log("blacklist:", minimalBlacklist);

      //test backup
      // var backupFile = await agents[i].db.backupDB();
      // agents[i].db.restoreDB(backupFile);
      //
      // console.log("reputations:",agents[i].db.getPeerReputations());
      // //get blacklisted peers
      // console.log("blacklist:", agents[i].db.getAllBlacklistedPeers());

      console.log("+++++++++++++++");
    }

    console.log("Messages Re-Broadcasted:", createdMessages.length);
    console.log("***********","ROUND COMPLETE", y, "***********");
    y += 1;


  }
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
  app.listen(3000);
  console.log("Simulation API now listening on Port 3000");
  performTest(node);
});

node.on('error', async () => {
  console.log("**********ERROR*************")
  console.log("NO INTERNET CONNECTION DETECTED!");
  process.exit();
});
