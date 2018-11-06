const jsrecommender = require("./jsrecommender");
var recommender = new jsrecommender.Recommender();

const IPFS = require('ipfs');
const cryptr = require('cryptr');
const randomkey = require('random-key');

const crypto2 = require('crypto2');

var figlet = require('figlet');
const Configstore = require('configstore');
const pkg = require('./package.json');
const conf = new Configstore(pkg.name);
const chp = require('chainpoint-client');

const express = require('express');
const bodyParser = require("body-parser");
var app = express();
app.use(bodyParser.json());

//GLOBAL CONSTANT VARIABLES
const hivenet_ratings = 'hivenet_ratings';
const hivenet_chirps = 'hivenet_chirps';
const rating_timeout = 70; //if rating witnessed after this (in seconds) it will be dropped
const account_timeout = 30; //if rating for publicKey witnessed more often this it will be dropped

//GLOBAL DYNAMIC VARIABLES
var table = new jsrecommender.Table();
var mostRecentMessageTime = {}; //publicKey:lastTimeObserved
var whitelistAddresses = new Set();
var whitelistHostnames = new Set();
var blacklistHostnames = new Set();
var blacklistPeers = [];
var allMessagesSeen = [];
var urlsAvoided = [];
var originalUrls = {};
var blacklistedItemsForPublicKey = {};
var ratedUrls = {};


async function storeHashInChainpoint(hashToStore) {

  // Submit each hash to three randomly selected Nodes
  let proofHandles = await chp.submitHashes([hashToStore]);
  console.log("Submitted Proof Objects: Expand objects below to inspect.")
  console.log(proofHandles)

  // Wait for Calendar proofs to be available
  console.log("Sleeping 12 seconds to wait for proofs to generate...")
  await new Promise(resolve => setTimeout(resolve, 12000))

  // Retrieve a Calendar proof for each hash that was submitted
  let proofs = await chp.getProofs(proofHandles)
  console.log("Proof Objects: Expand objects below to inspect.")
  console.log(proofs)

  let proofToUse = null;
  for (i in proofs) {
    if (proofs[i].proof != null) {
      proofToUse = proofs[i].proof;
      break
    }
  }

  console.log("Single Proof Selected")
  console.log(proofToUse);

  // Verify every anchor in every Calendar proof
  let verifiedProofs = await chp.verifyProofs([proofToUse])
  console.log("Verified Proof Objects: Expand objects below to inspect.")
  console.log(verifiedProofs)

  //different nodes return different proofs however all have same anchor id
  return proofToUse;

}

async function verifyProofInChainpoint(proof) {
  let verifiedProofs = await chp.verifyProofs([proof])
  console.log("Verified Proof Objects: Expand objects below to inspect.")
  console.log(verifiedProofs)

  if (verifiedProofs.length > 0) {
    return verifiedProofs[0]["hashSubmittedCoreAt"];
  } else {
    return null;
  }
}


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

async function createMessage(url, rating) {

  const { publicKey, privateKey } = await getKeys();

  const payload = JSON.stringify({url:url, rating:rating});
  console.log("payload:", payload, "\n");

  const signature = await crypto2.sign.sha256(payload, privateKey);
  console.log("signature:", signature, "\n");

  const signedPayload = JSON.stringify({signature:signature, payload:payload});

  const signedPayloadHash = await crypto2.hash.sha256(signedPayload);
  console.log("signed payload hash:", signedPayloadHash, "\n");

  const isSignatureValid = await crypto2.verify.sha256(payload, publicKey, signature);
  console.log("signature valid:", isSignatureValid, "\n");

  const messageProof = await storeHashInChainpoint(signedPayloadHash);
  console.log("signed hash proof:", messageProof, "\n");

  const messageToSend = JSON.stringify({proof:messageProof, message:{signature:signature, publicKey:publicKey, payload:payload}});
  console.log("message to send:", messageToSend, "\n");

  const valid_message = await checkMessage(messageToSend);
  console.log("Valid Message:", valid_message);
}

async function getMostRecentTime(publicKey) {
  if (publicKey in mostRecentMessageTime) {
    return mostRecentMessageTime[publicKey];
  } else {
    return null;
  }
}

async function updateMostRecentTime(publicKey, timeSeen) {
  mostRecentMessageTime[publicKey] = timeSeen;
}

async function checkMessage(selfPublicKey, recievedMessage) {
  const parsedMessage = JSON.parse(recievedMessage);

  if ("proof" in parsedMessage) {
    const creationTime = await verifyProofInChainpoint(parsedMessage["proof"]);
    if (creationTime != null) {
      if ("message" in parsedMessage) {
        if ("signature" in parsedMessage["message"] && "publicKey" in parsedMessage["message"] && "payload" in parsedMessage["message"]) {
          const isSignatureValid = await crypto2.verify.sha256(parsedMessage["message"]["payload"], parsedMessage["message"]["publicKey"], parsedMessage["message"]["signature"]);
          if (isSignatureValid == true) {
            if (parsedMessage["message"]["publicKey"] == selfPublicKey) {
              return false;
            } else {
              const timeSinceCreation = (new Date() - new Date(creationTime))/1000;
              console.log("Time Since Creation(s):", timeSinceCreation);
              if (timeSinceCreation > rating_timeout) {
                return false;
              }
              // TODO: CHECK LAST PUBLIC KEY CREATION TIME
              const mostRecentAccountTime = await getMostRecentTime(parsedMessage["message"]["publicKey"]);
              if (mostRecentAccountTime == null) {
                //never seen user before
                await updateMostRecentTime(parsedMessage["message"]["publicKey"], creationTime);
                return true;
              } else {
                const timeSinceLastSend = (new Date(creationTime) - new Date(mostRecentAccountTime))/1000;
                if (timeSinceLastSend < account_timeout || timeSinceLastSend < 0) { //if negative this means that old message
                  return false;
                } else {
                  await updateMostRecentTime(parsedMessage["message"]["publicKey"], creationTime);
                  return true;
                }
              }
              return true;
            }
          } else {
            return false;
          }
        } else {
          return false;
        }
      } else {
        return false;
      }
    } else {
      return false
    }
  } else {
    return false;
  }
}




//PUBSUB HANDLING
const recieveRating = async (msg) => {
  const { publicKey, privateKey } = await getKeys();
  // node.config.get('Identity.PeerID', (err, peerId) => {
  //     if (peerId != msg.from) { //means that self did not send
  //       var url_string = msg.data.toString();
  //       if (!((url_string.indexOf("http://") < 0) && (url_string.indexOf("https://") < 0))) {
  //         var should_add = check_if_in_data(url_string);
  //
  //         if (should_add == true) {
  //           vorpal.log(`pubsub url: `, msg.data.toString());
  //           pubsub_urls.push(url_string);
  //         }
  //       }
  //     } else {
  //       vorpal.log(`dismissing pubsub url: `, msg.data.toString());
  //     }
  // })
  const messageCorrect = await checkMessage(publicKey, msg.data.toString());
  if (messageCorrect) {
    allMessagesSeen.append(msg.data.toString());
  }
};

const recieveChirp = async (msg) => {
  const { publicKey, privateKey } = await getKeys();

  // node.config.get('Identity.PeerID', (err, peerId) => {
  //     if (peerId != msg.from) { //means that self did not send
  //       var url_string = msg.data.toString();
  //       if (!((url_string.indexOf("http://") < 0) && (url_string.indexOf("https://") < 0))) {
  //         var should_add = check_if_in_data(url_string);
  //
  //         if (should_add == true) {
  //           vorpal.log(`pubsub url: `, msg.data.toString());
  //           pubsub_urls.push(url_string);
  //         }
  //       }
  //     } else {
  //       vorpal.log(`dismissing pubsub url: `, msg.data.toString());
  //     }
  // })
};


function extractHostname(url) {
    var hostname;
    //find & remove protocol (http, ftp, etc.) and get hostname

    if (url.indexOf("//") > -1) {
        hostname = url.split('/')[2];
    }
    else {
        hostname = url.split('/')[0];
    }

    //find & remove port number
    hostname = hostname.split(':')[0];
    //find & remove "?"
    hostname = hostname.split('?')[0];

    return hostname;
}

function removeParams(url) {

    return url.split('?')[0];;
}

function runRecommender() {
  console.log("reloading recommendations...");
  console.log(ratedUrls);
}

function addToRatings(publicKey, urlFullAddress, rating) {
  if (publicKey in ratedUrls) {
    ratedUrls[publicKey][urlFullAddress] = rating;
  } else {
    ratedUrls[publicKey] = {};
    ratedUrls[publicKey][urlFullAddress] = rating;
  }
  console.log(ratedUrls);

}

function addToWhitelists(urlFullAddress, urlHostname) {
  if (blacklistHostnames.has(urlHostname)) {
    console.log("did not add to whitelist because already blacklisted!");
    return false;
  } else {
    if (whitelistAddresses.has(urlFullAddress) == false) {
      whitelistAddresses.add(urlFullAddress);
    }

    if (whitelistHostnames.has(urlHostname) == false) {
      whitelistHostnames.add(urlHostname);
    }

    console.log("Whitelist Addresses:", whitelistAddresses);
    console.log("Whitelist Hostnames:",whitelistHostnames);

    return true;
  }

}

function blacklistPeer(publicKey) {
  //TODO: WHAT TO DO WHEN BLACKLISTING PEER

}


function addToBlacklists(myPublicKey, urlHostname) {
  if (blacklistHostnames.has(urlHostname)) {
    console.log("already in blacklist");
  } else {
    blacklistHostnames.add(urlHostname);

    //TODO: need to remove all containing url hostname
    for (address in whitelistAddresses) {
      if (address.includes(urlHostname) == true) {
        whitelistAddresses.delete(address);
      }
    }


    if (whitelistHostnames.has(urlHostname) == true) {
      whitelistHostnames.delete(urlHostname);
    }

    console.log("Whitelist Addresses:", whitelistAddresses);
    console.log("Whitelist Hostnames:",whitelistHostnames);

    //remove all urls from ratings with urlHostname and blacklist any peers that rated good
    var publicKeysToRemove = [];
    for (publicKey in ratedUrls) {
      if (publicKey == myPublicKey) {
        var newRatings = {};
        for (urlAddress in ratedUrls[publicKey]) {
          if (urlAddress.includes(urlHostname) == false) {
            newRatings[urlAddress] = ratedUrls[publicKey][urlAddress];
          } else {
            console.log("removing", urlAddress, "from personal");
          }
        }
        ratedUrls[publicKey] = newRatings;

      } else {
        var shouldBan = false;
        for (urlAddress in ratedUrls[publicKey]) {
          if (urlAddress.includes(urlHostname)) {
            shouldBan = true;
            break;
          }
        }
        if (shouldBan) {
          console.log("removing publicKey:", publicKey);
          publicKeysToRemove.append(publicKey);
          blacklistPeer(publicKey);
        }
      }
    }

    for (publicKey in publicKeysToRemove) {
      delete ratedUrls[publicKey];
    }

  }

}

//EXPRESS APP
app.post('/addWhitelist', function (req, res) {
  //ONLY SENT WHEN NO RATING OBSERVED AT URL

  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

  //need full URL
  if (req.body.url == undefined) {
    res.status(422).json();
    return;
  }

  const urlFullAddress = removeParams(req.body.url);
  const urlHostname = extractHostname(req.body.url);

  const successAdding = addToWhitelists(urlFullAddress, urlHostname);
  if (successAdding) {
    runRecommender();
  }

  console.log("WHITELIST ADDITION", urlFullAddress, urlHostname, successAdding);

  res.status(200).json();
});

app.post('/addRating', async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

  //need full URL
  if (req.body.url == undefined || req.body.rating == undefined) {
    res.status(422).json();
    return;
  }

  const urlFullAddress = removeParams(req.body.url);
  const urlHostname = extractHostname(req.body.url);
  const rating = req.body.rating;
  const {publicKey, privateKey} = await getKeys();
  if (rating == 0 || rating == 1) {
    const successAdding = addToWhitelists(urlFullAddress, urlHostname);
    if (successAdding) {
      addToRatings(publicKey, urlFullAddress, rating);
      runRecommender();
    }
  } else if (rating == -1) {
    //blacklist
    addToBlacklists(publicKey, urlHostname);
  } else {
    res.status(422).json();
    return;
  }

  console.log("RATING", urlFullAddress, urlHostname, rating);
  res.status(200).json();

  //TODO: EMIT MESSAGE

});

app.post('/getScore', function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  if (req.body.url == undefined) {
    res.status(422).json();
    return;
  }

  const urlFullAddress = removeParams(req.body.url);
  const urlHostname = extractHostname(req.body.url);
  if (blacklistHostnames.has(urlHostname)) {
    res.status(200).json({status:"blacklist"});
  } else if (whitelistHostnames.has(urlHostname)){
    //score
    res.status(200).json({status:"whitelist"});
  } else {
    res.status(200).json({status:"unsure"});
  }
});

//
// app.get('/getRecommendation', function (req, res) {
//   res.header("Access-Control-Allow-Origin", "*");
//   res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
//
//   if (CURRENT_USER_ACCOUNT in ratingsByKey) {
//     let stringified = JSON.stringify(ratingsByKey[CURRENT_USER_ACCOUNT]);
//     encrypt_and_store_string(stringified, function(err, ipfs_address, secret) {
//       if (err) {
//         res.status(404).json({"error":err});
//       } else {
//         res.status(200).json({"access_token":ipfs_address + "&" + secret});
//
//       }
//     })
//   } else {
//     res.status(404).json({"error":"No ratings for user!"});
//   }
// });


//INIT CODE
figlet('HIVENET', function(err, data) {
    if (err) {
        console.log('Something went wrong...');
        console.dir(err);
        return;
    }
    console.log(data, "\n");
    initNet();
});

async function initNet() {
  //EXPRESS SERVER
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

  node.on('ready', async () => { //wait to run command line until IPFS initialized
    app.listen(3000);
    console.log("hivenet API now listening on Port 3000");

    node.pubsub.subscribe(hivenet_ratings, recieveRating, {discover:true}, (err) => {
      if (err) {
        console.log(`failed to subscribe to ${hivenet_ratings}`, err);
      }
      console.log(`subscribed to ${hivenet_ratings}`);
    })

    // node.pubsub.subscribe(hivenet_chirps, recieveChirp, {discover:true}, (err) => {
    //   if (err) {
    //     console.log(`failed to subscribe to ${hivenet_chirps}`, err);
    //   }
    //   console.log(`subscribed to ${hivenet_chirps}`);
    // })

  });

}
