const chp = require('chainpoint-client');
const crypto2 = require('crypto2');
const hexToBinary = require('hex-to-binary');
const bigInt = require("big-integer");
const IPFS = require('ipfs');
const simpledb = require('./simpledb.js');

const setting = "TEST";


async function storeString(IPFSNode, inputString) {
  let promise = new Promise((resolve, reject) => {
    IPFSNode.files.add({
      content: Buffer.from(inputString)
    }, (err, res) => {
      resolve(res[0].hash);
    });
  });

  let IPFSHash = await promise;
  // console.log("MESSAGE IPFS:", IPFSHash);
  return IPFSHash;
}

async function encryptAndStoreString(IPFSNode, inputString, publicKey, privateKey) {
  const encrypter = new cryptr(privateKey);
  const encryptedString = encrypter.encrypt(inputString);
  let IPFSHash = await storeString(IPFSNode, encryptedString);
  console.log("MESSAGE IPFS:", IPFSHash);
  return IPFSHash;
}

async function getString(IPFSNode, ipfsAddress) {
  try {
    let promise = new Promise((resolve, reject) => {
      IPFSNode.pin.add(ipfsAddress, function(err) {
        if (err) {
          reject(err);
        } else {
          IPFSNode.files.cat(ipfsAddress, function(err, file) {
            if (err) {
              reject(err);
            } else {
              resolve(file.toString());
            }
          });
        }
      });
    });
    let IPFSContents = await promise;
    console.log("MESSAGE IPFS Contents:", IPFSContents);
    return IPFSContents;
  } catch (err) {
    return null;
  }
}

async function getAndDecryptString(IPFSNode, ipfsAddress, publicKey, privateKey) {
  try {
    const encrypter = new cryptr(privateKey);
    let IPFSContents = await getString(IPFSNode, ipfsAddress);
    const decryptedFile = encrypter.decrypt(IPFSContents);
    console.log("Decrypted MESSAGE IPFS Contents:", decryptedFile);
    return decryptedFile;
  } catch (err) {
    return null;
  }
}

var fakeChainpointProofs = [];

async function storeHashInChainpoint(hashToStore) {
  if (setting == "PROD") {
    // Submit each hash to three randomly selected Nodes
    let proofHandles = await chp.submitHashes([hashToStore]);
    // console.log("Submitted Proof Objects: Expand objects below to inspect.")
    // console.log(proofHandles)

    // Wait for Calendar proofs to be available
    // console.log("Sleeping 20 seconds to wait for proofs to generate...")
    await new Promise(resolve => setTimeout(resolve, 20000))

    // Retrieve a Calendar proof for each hash that was submitted
    let proofs = await chp.getProofs(proofHandles)
    // console.log("Proof Objects: Expand objects below to inspect.")
    // console.log(proofs)

    let proofToUse = null;
    for (i in proofs) {
      if (proofs[i].proof != null) {
        proofToUse = proofs[i].proof;
        break
      }
    }

    // console.log("Single Proof Selected")
    // console.log(proofToUse);

    // Verify every anchor in every Calendar proof
    let verifiedProofs = await chp.verifyProofs([proofToUse])
    // console.log("Verified Proof Objects: Expand objects below to inspect.")
    // console.log(verifiedProofs)

    //different nodes return different proofs however all have same anchor id
    return {proofToUse:proofToUse, verifiedProof:verifiedProofs[0]};
  } else {
    fakeChainpointProofs.push({
      "hashSubmittedCoreAt":(new Date()).toISOString(),
      "hash":hashToStore
    })
    return {proofToUse:(fakeChainpointProofs.length - 1).toString(), verifiedProof:"YYY"};
  }
}

async function verifyProofInChainpoint(proof) {
    if (setting == "PROD") {
      let verifiedProofs = await chp.verifyProofs([proof])
      // console.log("Verified Proof Objects: Expand objects below to inspect.")
      // console.log(verifiedProofs)

      if (verifiedProofs.length > 0) {
        return verifiedProofs[0];
      } else {
        return null;
      }
    } else {
      return fakeChainpointProofs[parseInt(proof)];
    }
}

async function findNonce(proofHash) {
  const difficulty = 5;
  var nonce = bigInt("0");
  var bestLeadingZeros = -1;
  var start = new Date().getTime();
  while (true) {
    const leadingZeros = await checkNonce(proofHash, nonce.toString());
    if (leadingZeros  > bestLeadingZeros) {
      bestLeadingZeros = leadingZeros;
      if (bestLeadingZeros >= difficulty) {
        var end = new Date().getTime();
        var time = (end - start);
        if (time > 0) {
          // console.log("***FINISHED***","Current Nonce:", nonce.toString(), "Best Leading Zeros:", bestLeadingZeros, "Time Elapsed:", time/1000, "Hash/s:", nonce.divide(time).multiply(1000).toString());
        }
        break;
      }
    }
    if (nonce.mod(10000) == 0) {
      var end = new Date().getTime();
      var time = (end - start);
      if (time > 0) {
        // console.log("Current Nonce:", nonce.toString(), "Best Leading Zeros:", bestLeadingZeros, "Time Elapsed:", time/1000, "Hash/s:", nonce.divide(time).multiply(1000).toString());
      }

    }

    nonce = nonce.add(1);
  }

  return nonce.toString();
}

async function checkNonce(proofHash, nonce) {
  const hash = await crypto2.hash.sha256(proofHash + nonce);
  const binaryHash = hexToBinary(hash);
  const leadingZeros = binaryHash.split(1)[0].length;
  return leadingZeros;
}

const url = require('url');
function cleanURL(url) {
  var myURL = new URL(url);
  var toDelete = [];
  for(var key of myURL.searchParams.keys()) {
    if (key.includes("utm")) {
      toDelete.push(key);
    }

  }
  for(var key of toDelete) {
    myURL.searchParams.delete(key);
  }

  myURL.searchParams.sort();
  return myURL.href;
}


async function createMessage(IPFSNode, url, rating, lastMessageIPFS, publicKey, privateKey) {
  var rawPayload = {
    url:cleanURL(url),
    rating:rating
  };

  if (lastMessageIPFS != null) {
    // console.log("Last Message IPFS:", lastMessageIPFS);
    rawPayload["lastMessageIPFS"] = lastMessageIPFS;
  } else {
    // console.log("Last Message IPFS:", null);
  }

  const payload = JSON.stringify(rawPayload);
  // console.log("payload:", payload, "\n");

  const signature = await crypto2.sign.sha256(payload, privateKey);
  // console.log("signature:", signature, "\n");

  const signedPayload = JSON.stringify({signature:signature, payload:payload});

  const signedPayloadHash = await crypto2.hash.sha256(signedPayload);
  // console.log("signed payload hash:", signedPayloadHash, "\n");

  const isSignatureValid = await crypto2.verify.sha256(payload, publicKey, signature);
  // console.log("signature valid:", isSignatureValid, "\n");

  const {proofToUse, verifiedProof} = await storeHashInChainpoint(signedPayloadHash);
  // console.log("signed hash proof:", proofToUse, "\n");

  //calculate nonce
  const proofHash = await crypto2.hash.sha256(proofToUse);
  // console.log("Finding Nonce for:", proofHash);
  const nonce = await findNonce(proofHash);
  // console.log("Hash Leading Zeros", proofHash, await checkNonce(proofHash, nonce));

  const messageToSend = JSON.stringify({proof:proofToUse, nonce:nonce, message:{signature:signature, publicKey:publicKey, payload:payload}});
  // console.log("message to send:", messageToSend, "\n");

  let IPFSHash = await storeString(IPFSNode, messageToSend);
  // console.log("MESSAGE IPFS:", IPFSHash);

  return {IPFSHash: IPFSHash, messageContents:messageToSend};

}

async function blacklistPeer(publicKey) {
  if (publicKey != null) {
    console.log("SHOULD BLACKLIST:", publicKey);
  }
}

async function parseMessage(messageIPFS, recievedMessage) { //returns null if not valid
  const difficulty = 5;
  const parsedMessage = JSON.parse(recievedMessage);
  //check if valid signature (then can blacklist for errors)
  var validPublicKey = null;
  if ("message" in parsedMessage) {
    if ("signature" in parsedMessage["message"] && "publicKey" in parsedMessage["message"] && "payload" in parsedMessage["message"]) {
      const isSignatureValid = await crypto2.verify.sha256(parsedMessage["message"]["payload"], parsedMessage["message"]["publicKey"], parsedMessage["message"]["signature"]);
      if (isSignatureValid == true) {
        // console.log("valid signature!")
        validPublicKey = parsedMessage["message"]["publicKey"];
      } else {
        console.log("invalid signature");
        return {shouldBlacklist:null, parsedMessage:null};
      }
    } else {
      console.log("invalid signature");
      return {shouldBlacklist:null, parsedMessage:null};
    }
  }

  //check that proof is valid
  var creationTime = null;
  if ("proof" in parsedMessage) {
    const verifiedProof = await verifyProofInChainpoint(parsedMessage["proof"]);

    if (verifiedProof != null) {
      const signedPayload = JSON.stringify({signature:parsedMessage["message"]["signature"], payload:parsedMessage["message"]["payload"]});
      const signedPayloadHash = await crypto2.hash.sha256(signedPayload);
      if (verifiedProof["hash"] != signedPayloadHash) {
        console.log("proof does not match message!");
        return {shouldBlacklist:validPublicKey, parsedMessage:null};
      } else {
        // console.log("valid proof!");
        creationTime = verifiedProof["hashSubmittedCoreAt"];
      }
    } else {
      console.log("invalid proof");
      return {shouldBlacklist:validPublicKey, parsedMessage:null};
    }
  } else {
    console.log("No proof!");
    return {shouldBlacklist:validPublicKey, parsedMessage:null};
  }

  //check that nonce is valid
  if ("nonce" in parsedMessage) {
    const proofHash = await crypto2.hash.sha256(parsedMessage["proof"]);
    const leadingZeros = await checkNonce(proofHash, parsedMessage["nonce"]);
    if (leadingZeros < difficulty) {
      console.log("Invalid nonce!");
      return {shouldBlacklist:validPublicKey, parsedMessage:null};
    } else {
      // console.log("Valid nonce!");
    }
  }

  const parsedPayload = JSON.parse(parsedMessage["message"]["payload"]);
  var toReturn = {
    creationTime:creationTime,
    publicKey:parsedMessage["message"]["publicKey"],
    rating:parsedPayload["rating"],
    url:parsedPayload["url"],
    messageIPFS:messageIPFS
  };
  if (parsedPayload["lastMessageIPFS"]) {
    toReturn["lastMessageIPFS"] = parsedPayload["lastMessageIPFS"];
  } else {
    toReturn["lastMessageIPFS"] = "<none>";
  }

  // console.log("Parsed Message:", toReturn);
  return {shouldBlacklist:null, parsedMessage:toReturn};
}

const agent = require("./agent.js");
async function createAgent() {
  var agentInstance = new agent();
  await agentInstance.initialize();
  return agentInstance;
}

async function performTest(IPFSNode) {

  var agents = [];
  const numAgents = 4;
  var i;
  for (i = 0; i < numAgents; i++) {
    console.log("Agent:", i)
    var thisAgent = await createAgent();
    console.log(thisAgent.publicKey);
    agents.push(thisAgent);
  }


  //simulate 10 rounds
  //can choose to send (be honest or malicious) or not
  //probability that any agent is chosen to process messages created in round
  var createdMessages = [];
  var y = 0;
  while (true) {
    var i;
    for (i = 0; i < agents.length; i++) {
      var urlToSend = agents[i].getRandomURL();
      var ratingToGive = agents[i].getRating();
      if (urlToSend != null) {
        if (agents[i].db.checkIfAlreadyRated(agents[i].publicKey, urlToSend)) {
          continue;
        }

        console.log("Agent:", i, urlToSend, "Rating:", ratingToGive, "Risk Score:", agents[i].db.getURLRiskScore(agents[i].publicKey, urlToSend));


        const {IPFSHash, messageContents} = await createMessage(IPFSNode, urlToSend, ratingToGive, agents[i].lastMessageIPFS, agents[i].publicKey, agents[i].privateKey);
        agents[i].lastMessageIPFS = IPFSHash;
        const {shouldBlacklist, parsedMessage} = await parseMessage(IPFSHash, messageContents); //should never be blacklist for self
        agents[i].db.addMessage(agents[i].publicKey, parsedMessage);

        createdMessages.push([IPFSHash, messageContents]); //broadcast
      }
    }
    //process messages (can choose to rebroadcast and add back to createdMessages)
    while(createdMessages.length > 0) {
      var thisMessage = createdMessages.pop();
      var i;
      for (i = 0; i < agents.length; i++) {
        if (Math.random() > 0.5) {
          //NEED TO CONSIDER PULLING HISTORY
          const {shouldBlacklist, parsedMessage} = await parseMessage(thisMessage[0], thisMessage[1]); //should never be blacklist for self
          if (shouldBlacklist) {
            console.log("NEED TO IMPLEMENT BLACKLIST", shouldBlacklist);
          } else {
            if (parsedMessage) {
              agents[i].db.addMessage(agents[i].publicKey, parsedMessage);
            }
          }
        }
      }
    }

    //get getPeerReputations
    var i;
    for (i = 0; i < agents.length; i++) {
      console.log(i, "reputations");
      console.log(agents[i].db.getPeerReputations(agents[i].publicKey));
      console.log("\n");
    }
    console.log("***********","ROUND COMPLETE", y, "***********");
    console.log("\n\n");
    y += 1;


  }




  // //CREATE VALID MESSAGES
  // var lastMessageIPFS = null;
  // var createdMessages = [];
  // var i;
  // for (i = 0; i < urlsToRate.length; i++) {
  //   let thisMessageIPFS = await createMessage(IPFSNode, urlsToRate[i], 1, lastMessageIPFS, publicKey, privateKey);
  //   createdMessages.push(thisMessageIPFS);
  //   lastMessageIPFS = thisMessageIPFS;
  // }
  //
  // //RECIEVE MESSAGES
  // var i;
  // for (i = 0; i < createdMessages.length; i++) {
  //   //check DB to make sure not already contains before doing work
  //   let fileContents = await getString(IPFSNode, createdMessages[i]);
  //   let parsedMessage = await parseMessage(createdMessages[i], fileContents);
  //   if (parsedMessage != null) {
  //     console.log("Message Add Response:", myDB.addMessage(parsedMessage));
  //   }
  // }
  //
  // //CREATE NEW IDENTITY AND RATE SAME AS ORIGINAL
  // var {publicKey, privateKey} = await createKeys();
  //
  // //ADD TO DB
  // var lastMessageIPFS = null;
  // var createdMessages = [];
  // var i;
  // for (i = 0; i < urlsToRate.length; i++) {
  //   let thisMessageIPFS = await createMessage(IPFSNode, urlsToRate[i], 1, lastMessageIPFS, publicKey, privateKey);
  //   createdMessages.push(thisMessageIPFS);
  //   lastMessageIPFS = thisMessageIPFS;
  //   break;
  // }
  //
  // var i;
  // for (i = 0; i < createdMessages.length; i++) {
  //   //check DB to make sure not already contains before doing work
  //   let fileContents = await getString(IPFSNode, createdMessages[i]);
  //   let parsedMessage = await parseMessage(createdMessages[i], fileContents);
  //   if (parsedMessage != null) {
  //     console.log("Message Add Response:", myDB.addMessage(parsedMessage));
  //   }
  // }
  //
  // //TEST IF REPUTATION OF SAID PEER IS 1
  // console.log(myDB.getPeerReputations(publicKey));
  // console.log(urlsToRate[0], "Risk Score:", myDB.getURLRiskScore(publicKey, cleanURL(urlsToRate[0])))
  // console.log(urlsToRate[1], "Risk Score:", myDB.getURLRiskScore(publicKey, cleanURL(urlsToRate[1])));

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
