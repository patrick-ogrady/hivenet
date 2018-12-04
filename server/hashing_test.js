const chp = require('chainpoint-client');
const crypto2 = require('crypto2');
const hexToBinary = require('hex-to-binary');
const bigInt = require("big-integer");
const IPFS = require('ipfs');

async function createKeys() {
  console.log("CREATING KEY PAIRS");
  const { privateKey, publicKey } = await crypto2.createKeyPair();
  console.log("Public Key:", publicKey, "\n");

  return {publicKey:publicKey, privateKey:privateKey};
}

async function storeString(IPFSNode, inputString) {
  let promise = new Promise((resolve, reject) => {
    IPFSNode.files.add({
      content: Buffer.from(inputString)
    }, (err, res) => {
      resolve(res[0].hash);
    });
  });

  let IPFSHash = await promise;
  console.log("MESSAGE IPFS:", IPFSHash);
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

async function storeHashInChainpoint(hashToStore) {

  // Submit each hash to three randomly selected Nodes
  let proofHandles = await chp.submitHashes([hashToStore]);
  console.log("Submitted Proof Objects: Expand objects below to inspect.")
  console.log(proofHandles)

  // Wait for Calendar proofs to be available
  console.log("Sleeping 20 seconds to wait for proofs to generate...")
  await new Promise(resolve => setTimeout(resolve, 20000))

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
  return {proofToUse:proofToUse, verifiedProof:verifiedProofs[0]};

}

async function verifyProofInChainpoint(proof) {
    let verifiedProofs = await chp.verifyProofs([proof])
    console.log("Verified Proof Objects: Expand objects below to inspect.")
    console.log(verifiedProofs)

    if (verifiedProofs.length > 0) {
      return verifiedProofs[0];
    } else {
      return null;
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
          console.log("***FINISHED***","Current Nonce:", nonce.toString(), "Best Leading Zeros:", bestLeadingZeros, "Time Elapsed:", time/1000, "Hash/s:", nonce.divide(time).multiply(1000).toString());
        }
        break;
      }
    }
    if (nonce.mod(10000) == 0) {
      var end = new Date().getTime();
      var time = (end - start);
      if (time > 0) {
        console.log("Current Nonce:", nonce.toString(), "Best Leading Zeros:", bestLeadingZeros, "Time Elapsed:", time/1000, "Hash/s:", nonce.divide(time).multiply(1000).toString());
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
    console.log("Last Message IPFS:", lastMessageIPFS);
    rawPayload["lastMessageIPFS"] = lastMessageIPFS;
  } else {
    console.log("Last Message IPFS:", null);
  }

  const payload = JSON.stringify(rawPayload);
  console.log("payload:", payload, "\n");

  const signature = await crypto2.sign.sha256(payload, privateKey);
  console.log("signature:", signature, "\n");

  const signedPayload = JSON.stringify({signature:signature, payload:payload});

  const signedPayloadHash = await crypto2.hash.sha256(signedPayload);
  console.log("signed payload hash:", signedPayloadHash, "\n");

  const isSignatureValid = await crypto2.verify.sha256(payload, publicKey, signature);
  console.log("signature valid:", isSignatureValid, "\n");

  const {proofToUse, verifiedProof} = await storeHashInChainpoint(signedPayloadHash);
  console.log("signed hash proof:", proofToUse, "\n");

  //calculate nonce
  const proofHash = await crypto2.hash.sha256(proofToUse);
  console.log("Finding Nonce for:", proofHash);
  const nonce = await findNonce(proofHash);
  console.log("Hash Leading Zeros", proofHash, await checkNonce(proofHash, nonce));

  const messageToSend = JSON.stringify({proof:proofToUse, nonce:nonce, message:{signature:signature, publicKey:publicKey, payload:payload}});
  console.log("message to send:", messageToSend, "\n");

  let IPFSHash = await storeString(IPFSNode, messageToSend);
  console.log("MESSAGE IPFS:", IPFSHash);

  return IPFSHash;

}

async function blacklistPeer(publicKey) {
  if (publicKey != null) {
    console.log("SHOULD BLACKLIST:", publicKey);
  }
}

async function parseMessage(recievedMessage) { //returns null if not valid
  const difficulty = 5;
  const parsedMessage = JSON.parse(recievedMessage);

  //check if valid signature (then can blacklist for errors)
  var validPublicKey = null;
  if ("message" in parsedMessage) {
    if ("signature" in parsedMessage["message"] && "publicKey" in parsedMessage["message"] && "payload" in parsedMessage["message"]) {
      const isSignatureValid = await crypto2.verify.sha256(parsedMessage["message"]["payload"], parsedMessage["message"]["publicKey"], parsedMessage["message"]["signature"]);
      if (isSignatureValid == true) {
        console.log("valid signature!")
        validPublicKey = parsedMessage["message"]["publicKey"];
      } else {
        console.log("invalid signature");
        return null;
      }
    } else {
      console.log("invalid signature");
      return null;
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
        blacklistPeer(validPublicKey);
        return null;
      } else {
        console.log("valid proof!");
        creationTime = verifiedProof["hashSubmittedCoreAt"];
      }
    } else {
      console.log("invalid proof");
      blacklistPeer(validPublicKey);
      return null;
    }
  } else {
    console.log("No proof!");
    blacklistPeer(validPublicKey);
    return null;
  }

  //check that nonce is valid
  if ("nonce" in parsedMessage) {
    const proofHash = await crypto2.hash.sha256(parsedMessage["proof"]);
    const leadingZeros = await checkNonce(proofHash, parsedMessage["nonce"]);
    if (leadingZeros < difficulty) {
      console.log("Invalid nonce!");
      blacklistPeer(validPublicKey);
      return null;
    } else {
      console.log("Valid nonce!");
    }
  }

  const parsedPayload = JSON.parse(parsedMessage["message"]["payload"]);
  var toReturn = {
    creationTime:creationTime,
    publicKey:parsedMessage["message"]["publicKey"],
    rating:parsedPayload["rating"],
    url:parsedPayload["url"],
  };
  if (parsedPayload["lastMessageIPFS"]) {
    toReturn["lastMessageIPFS"] = parsedPayload["lastMessageIPFS"]
  }

  console.log("Parsed Message:", toReturn);
  return toReturn;
}

async function performTest(IPFSNode) {
  // var urlsToRate = [
  //   "https://en.bitcoin.it/wiki/Hashcash",
  //   "https://security.stackexchange.com/questions/14262/hashcash-is-this-really-used",
  //   "https://www.cnn.com/2018/12/03/politics/trump-bush-political-unity/index.html",
  //   "https://www.cnn.com/2018/12/03/politics/george-hw-bush-eulogy-funeral-plans/index.html",
  //   "https://bleacherreport.com/articles/2808828-kareem-hunt-admits-lying-to-chiefs-apologizes-in-nfl-countdown-interview?utm_source=cnn.com&utm_medium=referral&utm_campaign=editorial"
  // ];

  var urlsToRate = [
    "https://bleacherreport.com/articles/2808828-kareem-hunt-admits-lying-to-chiefs-apologizes-in-nfl-countdown-interview?utm_source=cnn.com&utm_medium=referral&utm_campaign=editorial"
  ];

  const {publicKey, privateKey} = await createKeys();

  //CREATE VALID MESSAGES
  var lastMessageIPFS = null;
  var createdMessages = [];
  var i;
  for (i = 0; i < urlsToRate.length; i++) {
    let thisMessageIPFS = await createMessage(IPFSNode, urlsToRate[i], 1, lastMessageIPFS, publicKey, privateKey);
    createdMessages.push(thisMessageIPFS);
    lastMessageIPFS = thisMessageIPFS;
  }

  //RECIEVE MESSAGES
  var i;
  for (i = 0; i < createdMessages.length; i++) {
    let fileContents = await getString(IPFSNode, createdMessages[i]);
    console.log(createdMessages[i], fileContents);
    await parseMessage(fileContents);
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


// findNonce("eJyNkz1uFEEQhTkChyBkvf3f1RNZ4gpETlbVVdXsSMvMamdsIDQkpA44ANjIBpEgIULusRKHoWe9GNkGiYlG3f2+fv2q6u3VIfXdKC/HH8txXA/NfP7CtnzQb57NaYltt+7bbpyf2Ivx1Vo+P7lZuljisNweZjCmaGLDVCiAzy4KWLEJlIFU2DOILcUiGJZiHEfWHCBnE41ka75MmEXLi65n2T5K4JMDVrMSDc20FphhRjtTGo2NEotS8H0nGY7z83Yc5Vq5wPGbURpm2syUfaqh8aax7ugGT/1mwiftA8ktvA2+4lOKko3xKHfxk/LveH90lTfY0VKGs9cfV5hl9ZVwtZiW+s3ieu+8Xw8/Hzw8fb/aPt45bbn5n1eefujXl8MSZ8aHnXjnYxL/xxvuit917TCemEZ7ZyFYbVT9GmWxls3XciCW4DHqnEk7lSikYG1SWCRpVSoZIlhLQoiOTNaWubqAlDMmRNLibCi1nB4yi3BIokSzK84RQK4ntddGSqn4DI60BkYKt11utofs6ttjFtBI4IKOyXvrNFgTQQNSqZwUi1VKC2OgbHyE6kAVYudTvgfMBYAInQ7AznBR5F2MVC2hipKSRJNiCD7WJk4xZq6bqiZgyMUEhe4BY61byb5Gzy6YysneYdExeBeSqbEmX/MgVf9KzpI8+2oXC5gsjkq8W5hkppy1uqlM8I1ufk8iHvwZwWkim9pdzV6xs0NiA9WgSlYYonIm1PsDqGA5iK45q5iJQ3Ql+gTZBXYoNU1MkJhJ3bJzed23w9mb3ayf18s+7Vu55cv9tRfHm3Y42x78y+K8qqRj3Mz3gvk0Tr8AdMZs9g==")
