const IPFS = require('ipfs');
var figlet = require('figlet');
const crypto2 = require('crypto2');
const simpledb = require('./simpledb.js');
const utilsLib = require('./utils.js');
var utils = new utilsLib("PROD");

var fs = require("fs");
const FILE_PATH = "/var/log/hivenet";
const publicKeyFile = "publicKey.txt";
const privateKeyFile = "privateKey.txt";
const lastMessageIPFSFile = "lastMessageIPFS.txt";
const dbBackupFile = "dbBackupFile.txt";

async function getFile(fileName) {
  let promise = new Promise((resolve, reject) => {
    fs.readFile(FILE_PATH + "/" + fileName, function(err, data) {
      if (err) {
        console.log("Get:", err);
        resolve(null);
      } else {
        resolve(data.toString());
      }
    })
  });
  return await promise;
}

async function saveFile(fileName, fileContent) {
  let promise = new Promise((resolve, reject) => {
    fs.writeFile(FILE_PATH + "/" + fileName, new Buffer.from(fileContent), { flag: 'w' }, function (err) {
      if (err) {
        console.log("Save:", err);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
  return await promise;
}

async function getKeys() {
  var publicKeyF = await getFile(publicKeyFile);
  var privateKeyF = await getFile(privateKeyFile);
  if (!publicKeyF) {
    const { privateKey, publicKey } = await crypto2.createKeyPair();
    await saveFile(publicKeyFile, publicKey);
    publicKeyF = publicKey;
    await saveFile(privateKeyFile, privateKey);
    privateKeyF = privateKey;
  }
  return {publicKey:publicKeyF, privateKey:privateKeyF};
}

async function getLastMessageIPFS() {
  return await getFile(lastMessageIPFSFile);
}

async function setLastMessageIPFS(lastMessageIPFS) {
  console.log("BACKING UP LAST MESSAGE IPFS:", lastMessageIPFS);
  await saveFile(lastMessageIPFSFile, lastMessageIPFS);
}

const express = require('express');
const bodyParser = require("body-parser");
var app = express();
app.use(bodyParser.json());

//INIT DB (potentially restore)
// async function get
async function initDB(IPFSNode) {
  const {publicKey, privateKey} = await getKeys();
  var thisDB = new simpledb(publicKey);
  var backupDBVal = await getFile(dbBackupFile);
  if(backupDBVal) {
    console.log("RESTORING DB FROM BACKUP:", backupDBVal);
    await thisDB.restoreDB(await utils.getAndDecryptString(IPFSNode, backupDBVal, publicKey, privateKey));
  } else {
    console.log("CREATING NEW DB:", dbBackupFile);
  }
  return thisDB;
}

async function backupDB(IPFSNode, currentDB) {
  const {publicKey, privateKey} = await getKeys();
  const backupString = await currentDB.backupDB();
  const IPFSHash = await utils.encryptAndStoreString(IPFSNode, backupString, publicKey, privateKey);
  console.log("BACKING UP DB:", IPFSHash);
  await saveFile(dbBackupFile, IPFSHash);
}

//PUBSUB HANDLING
const recieveMessage = async (msg) => {
  console.log("RECIEVED PUBSUB MESSAGE!");
  const recievedMessage = msg.data.toString();
  const IPFSHash = (await node.files.add(Buffer.from(recievedMessage), {onlyHash:true}))[0].hash;

  //SHOULD CHECK TO SEE IF HASH IN DB
  if (localDB.checkMessageIPFS(IPFSHash)) { //can avoid a lot of work
    console.log("ALREADY SEEN HASH:", IPFSHash);
    return;
  }


  var {shouldBlacklist, parsedMessage} = await utils.parseMessage(IPFSHash, recievedMessage); //should never be blacklist for self
  if (shouldBlacklist) {
    localDB.addBlacklistPeer(shouldBlacklist);
    return;
  }

  if (parsedMessage == null) {
    return;
  }

  console.log("TRY ADDING:", parsedMessage);

  var {shouldBlacklist, historyPull, shouldBroadcast} = localDB.addMessage(parsedMessage);

  if (shouldBlacklist) {
    localDB.addBlacklistPeer(shouldBlacklist);
    return;
  }

  //pull history
  var shouldBlacklist = await utils.pullHistory(node, localDB, parsedMessage.publicKey, historyPull);

  if (shouldBlacklist) {
    localDB.addBlacklistPeer(shouldBlacklist);
    return;
  }

  if (shouldBroadcast) {
    //useful message...should pin
    await utils.storeString(node, recievedMessage);
    //broadcast
    await broadcastMessage(recievedMessage);
  }

  //SHOW REPUTATION
  console.log(localDB.getCountUnseen());

  console.log("reputations:", localDB.getPeerReputations());
  //get blacklisted peers
  console.log("blacklist:", localDB.getAllBlacklistedPeers());

  //SHOW UNSEEN URLS

};

//MESSAGING QUEUE
var inProcess = false;
var messageQueue = [];

function processMessageQueue(rating, url) {
  console.log("RATING:", url, "SCORE:", rating);
  if (!inProcess) {
    inProcess = true //some chance where race condition in worst case
    // console.log("Nothing in process!");
    processMessage(rating, url);
  } else {
    // console.log("Message in Queue:", messageQueue.length);
    messageQueue.push([rating, url]);
  }
}

function endProcessMessage() {
  if (messageQueue.length) {
    // pull out oldest message and process it
    var nextMessage = messageQueue.shift();
    processMessage(nextMessage[0], nextMessage[1]);
  } else {
    //in the case that there is a race condition something could sit in messaging slightly too long
    inProcess = false;
  }
}

async function broadcastMessage(messageContents) {
  let promise = new Promise((resolve, reject) => {
    node.pubsub.publish(HIVENET_MESSAGES, Buffer.from(messageContents), (err) => {
      if (err) {
        console.error(`failed to publish to ${HIVENET_MESSAGES}`, err);
      } else {
        console.log(`BROADCASTING: ${messageContents} to ${HIVENET_MESSAGES}`);
        resolve();
      }

    });
  });

  await promise;

}

async function processMessage(rating, url) {
  //do processing
  const {publicKey, privateKey} = await getKeys();

  //Make sure not already rated (will automatically fail in add message but can avoid finding nonce)
  if(localDB.checkIfAlreadyRated(publicKey, utils.cleanURL(url))) {
    console.log("Already rated:", url);
  } else {
    const {IPFSHash, messageContents} = await utils.createMessage(node, url, rating, await getLastMessageIPFS(), publicKey, privateKey);
    await setLastMessageIPFS(IPFSHash);
    const {shouldBlacklist, parsedMessage} = await utils.parseMessage(IPFSHash, messageContents); //should never be blacklist for self
    localDB.addMessage(parsedMessage);

    //broadcast
    await broadcastMessage(messageContents);


    //BACKUP DB
    await backupDB(node, localDB);
  }

  endProcessMessage();
}


app.post('/rating', async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

  //need full URL
  if (req.body.url == undefined || req.body.rating == undefined) {
    res.status(422).json();
    return;
  }

  //ADD TO MESSAGING QUEUE
  processMessageQueue(req.body.rating, req.body.url);
  res.status(200).json();
});

// app.post('/risk', function (req, res) {
//   res.header("Access-Control-Allow-Origin", "*");
//   res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
//   if (req.body.url == undefined) {
//     res.status(422).json();
//     return;
//   }
//
//   // const urlFullAddress = removeParams(req.body.url);
//   // const urlHostname = extractHostname(req.body.url);
//   // if (blacklistHostnames.has(urlHostname)) {
//   //   res.status(200).json({status:"blacklist"});
//   // } else if (whitelistHostnames.has(urlHostname)){
//   //   //score
//   //   res.status(200).json({status:"whitelist"});
//   // } else {
//   //   res.status(200).json({status:"unsure"});
//   // }
// });

app.get('/recommendation', async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

  res.status(200).json({url:localDB.getRecommendationExtra()});
});



let node;
const HIVENET_MESSAGES = "hivenetMessages";
let localDB;

async function initNet() {
  //Init Database
  localDB = await initDB(node);

  //EXPRESS SERVER
  app.listen(3000);
  console.log("hivenet API now listening on Port 3000");

  node.pubsub.subscribe(HIVENET_MESSAGES, recieveMessage, {discover:true}, (err) => {
    if (err) {
      console.log(`failed to subscribe to ${HIVENET_MESSAGES}`, err);
    }
    console.log(`subscribed to ${HIVENET_MESSAGES}`);
  });

}


//INIT CODE
figlet('HIVENET', function(err, data) {
    if (err) {
        console.log('Something went wrong...');
        console.dir(err);
        return;
    }
    console.log(data, "\n");
    console.log("Loading IPFS Node....")
    node = new IPFS({
      repo: FILE_PATH + "/ipfsData",
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

    node.on('ready', initNet);

});
