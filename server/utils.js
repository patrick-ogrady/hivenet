const chp = require('chainpoint-client');
const crypto2 = require('crypto2');
const hexToBinary = require('hex-to-binary');
const bigInt = require("big-integer");
const url = require('url');
const cryptr = require('cryptr');
const workerLib = require('webworker-threads').Worker; //spawned worker

const PROD_DIFFICULTY = 21;
const GOAL_HASH = 5000;

module.exports = function(MODE){
  this.setting = MODE; //MODE should be "TEST" or "PROD";
  this.fakeChainpointProofs = [];


  this.storeString = async function(IPFSNode, inputString) {
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

  this.encryptAndStoreString = async function(IPFSNode, inputString, publicKey, privateKey) {
    const encrypter = new cryptr(privateKey);
    const encryptedString = encrypter.encrypt(inputString);
    let IPFSHash = await this.storeString(IPFSNode, encryptedString);
    console.log("MESSAGE IPFS:", IPFSHash);
    return IPFSHash;
  }

  this.getString = async function (IPFSNode, ipfsAddress) {
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
      // console.log("MESSAGE IPFS Contents:", IPFSContents);
      return IPFSContents;
    } catch (err) {
      return null;
    }
  }

  this.getAndDecryptString = async function(IPFSNode, ipfsAddress, publicKey, privateKey) {
    try {
      const encrypter = new cryptr(privateKey);
      let IPFSContents = await this.getString(IPFSNode, ipfsAddress);
      const decryptedFile = encrypter.decrypt(IPFSContents);
      // console.log("Decrypted MESSAGE IPFS Contents:", decryptedFile);
      return decryptedFile;
    } catch (err) {
      return null;
    }
  }

  this.storeHashInChainpoint = async function(hashToStore) {
    if (this.setting == "PROD") {
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
      console.log(proofs);

      let proofToUse = null;
      for (i in proofs) {
        if (proofs[i].proof != null) {
          proofToUse = proofs[i].proof;
          break
        }
      }

      // console.log("Single Proof Selected")
      console.log(proofToUse);

      // Verify every anchor in every Calendar proof
      let verifiedProofs = await chp.verifyProofs([proofToUse])
      // console.log("Verified Proof Objects: Expand objects below to inspect.")
      console.log(verifiedProofs);

      //different nodes return different proofs however all have same anchor id
      return {proofToUse:proofToUse, verifiedProof:verifiedProofs[0]};
    } else {
      this.fakeChainpointProofs.push({
        "hashSubmittedCoreAt":(new Date()).toISOString(),
        "hash":hashToStore
      })
      return {proofToUse:(this.fakeChainpointProofs.length - 1).toString(), verifiedProof:"YYY"};
    }
  }

  this.verifyProofInChainpoint = async function(proof) {
      if (this.setting == "PROD") {
        let verifiedProofs = await chp.verifyProofs([proof])
        // console.log("Verified Proof Objects: Expand objects below to inspect.")
        // console.log(verifiedProofs)

        if (verifiedProofs.length > 0) {
          return verifiedProofs[0];
        } else {
          return null;
        }
      } else {
        return this.fakeChainpointProofs[parseInt(proof)];
      }
  }

  this.sleep = function(millis) {
    return new Promise(resolve => setTimeout(resolve, millis));
  }

  this.findNonce = async function(proofHash) {
    var difficulty = 5;

    if (this.setting == "PROD") {
      difficulty = PROD_DIFFICULTY;
    }

    var defaultBreak = 1000;

    var nonce = bigInt("0");
    var bestLeadingZeros = -1;
    var start = new Date().getTime();
    while (true) {
      const leadingZeros = await this.checkNonce(proofHash, nonce.toString());
      if (leadingZeros  > bestLeadingZeros) {
        bestLeadingZeros = leadingZeros;
        if (bestLeadingZeros >= difficulty) {
          var end = new Date().getTime();
          var time = (end - start);
          if (time > 0 && this.setting == "PROD") {
            console.log("***FINISHED***","Current Nonce:", nonce.toString(), "Best Leading Zeros:", bestLeadingZeros, "Time Elapsed:", time/1000, "Hash/s:", nonce.divide(time).multiply(1000).toString());
          }
          break;
        }
      }
      if (nonce.mod(10000) == 0) {
        var end = new Date().getTime();
        var time = (end - start);
        if (time > 0 && this.setting == "PROD") {
          await this.sleep(defaultBreak); //BY FORCING SLEEP GIVES NODE TIME TO ANSWER REQUESTS
          var hPs = nonce.divide(time).multiply(1000);
          console.log("Break Time:", defaultBreak, "Current Nonce:", nonce.toString(), "Best Leading Zeros:", bestLeadingZeros, "Time Elapsed:", time/1000, "Hash/s:", hPs.toString());
          if (hPs > GOAL_HASH) {
            defaultBreak += 100;
          } else if (hPs < GOAL_HASH) {
            defaultBreak -= 100;
          }
        }

      }

      nonce = nonce.add(1);
    }

    return nonce.toString();
  }

  this.checkNonce = async function(proofHash, nonce) {
    const hash = await crypto2.hash.sha256(proofHash + nonce);
    const binaryHash = hexToBinary(hash);
    const leadingZeros = binaryHash.split(1)[0].length;
    return leadingZeros;
  }


  this.cleanURL = function(url) {
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

  //need two signatures (one for block sent to chainpoint and one to ensure message integrity)
  this.createMessage = async function(IPFSNode, url, rating, lastMessageIPFS, publicKey, privateKey) {
    var rawPayload = {
      url:this.cleanURL(url),
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

    const {proofToUse, verifiedProof} = await this.storeHashInChainpoint(signedPayloadHash);
    // console.log("signed hash proof:", proofToUse, "\n");

    //calculate nonce
    const proofHash = await crypto2.hash.sha256(proofToUse);
    // console.log("Finding Nonce for:", proofHash);

    const nonce = await this.findNonce(proofHash);
    // console.log("Hash Leading Zeros", proofHash, await checkNonce(proofHash, nonce));

    const messageToSend = JSON.stringify({proof:proofToUse, nonce:nonce, message:{signature:signature, publicKey:publicKey, payload:payload}});
    // console.log("message to send:", messageToSend, "\n");

    const entireSignature = await crypto2.sign.sha256(messageToSend, privateKey);
    const fullMessageToSend = JSON.stringify({signature:entireSignature, publicKey:publicKey, messageToSend:messageToSend});



    let IPFSHash = await this.storeString(IPFSNode, fullMessageToSend);
    // console.log("MESSAGE IPFS:", IPFSHash);

    return {IPFSHash: IPFSHash, messageContents:fullMessageToSend};

  }

  this.blacklistPeer = async function(publicKey) {
    if (publicKey != null) {
      console.log("SHOULD BLACKLIST:", publicKey);
    }
  }

  this.parseMessage = async function(messageIPFS, recievedMessage) { //returns null if not valid
    var difficulty = 5;

    if (this.setting == "PROD") {
      difficulty = PROD_DIFFICULTY;
    }
    const parsedMessageTop = JSON.parse(recievedMessage);

    //check if valid signature on entire signature (then can blacklist for errors)
    var validPublicKey = null;
    if ("signature" in parsedMessageTop && "publicKey" in parsedMessageTop && "messageToSend" in parsedMessageTop) {
      const isSignatureValid = await crypto2.verify.sha256(parsedMessageTop["messageToSend"], parsedMessageTop["publicKey"], parsedMessageTop["signature"]);
      if (isSignatureValid == true) {
        // console.log("valid signature!")
        validPublicKey = parsedMessageTop["publicKey"];
      } else {
        console.log("invalid signature");
        return {shouldBlacklist:null, parsedMessage:null};
      }
    } else {
      console.log("invalid signature");
      return {shouldBlacklist:null, parsedMessage:null};
    }

    var parsedMessage = JSON.parse(parsedMessageTop["messageToSend"]);

    if ("message" in parsedMessage) {
      if ("signature" in parsedMessage["message"] && "publicKey" in parsedMessage["message"] && "payload" in parsedMessage["message"]) {
        const isSignatureValid = await crypto2.verify.sha256(parsedMessage["message"]["payload"], parsedMessage["message"]["publicKey"], parsedMessage["message"]["signature"]);
        if (!isSignatureValid || parsedMessage["message"]["publicKey"] != validPublicKey) {
          console.log("invalid signature interior");
          return {shouldBlacklist:validPublicKey, parsedMessage:null};
        }
      } else {
        console.log("invalid signature interior");
        return {shouldBlacklist:validPublicKey, parsedMessage:null};
      }
    }

    //check that proof is valid
    var creationTime = null;
    if ("proof" in parsedMessage) {
      const verifiedProof = await this.verifyProofInChainpoint(parsedMessage["proof"]);

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
      const leadingZeros = await this.checkNonce(proofHash, parsedMessage["nonce"]);
      if (leadingZeros < difficulty) {
        console.log("Invalid nonce!");
        return {shouldBlacklist:validPublicKey, parsedMessage:null};
      } else {
        // console.log("Valid nonce!");
      }
    }

    const parsedPayload = JSON.parse(parsedMessage["message"]["payload"]);
    if (parsedPayload["url"].length < 5) {
      console.log("Invalid URL!");
      return {shouldBlacklist:validPublicKey, parsedMessage:null};
    }

    if (parsedPayload["rating"] != 0 && parsedPayload["rating"] != 1) {
      console.log("Invalid rating!");
      return {shouldBlacklist:validPublicKey, parsedMessage:null};
    }

    var toReturn = {
      creationTime:creationTime,
      publicKey:validPublicKey,
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

  this.pullHistory =  async function(IPFSNode, thisDB, originalPublicKey, nextMessageIPFS) {
    if (nextMessageIPFS && nextMessageIPFS != "<none>") {
      var historyPull = nextMessageIPFS;
      console.log("Should Historical Pull:", historyPull);
      while (historyPull != null && historyPull != "<none>") {
        if (thisDB.checkMessageIPFS(historyPull) == false) {
          var fileContents = await this.getString(IPFSNode, historyPull);
          var {shouldBlacklist, parsedMessage} = await this.parseMessage(historyPull, fileContents);
          if (shouldBlacklist) {
            return originalPublicKey;
          }
          if (originalPublicKey != parsedMessage.publicKey) {
            console.log("History stealing!");
            return originalPublicKey;
          }
          var {shouldBlacklist, historyPull} = thisDB.addMessage(parsedMessage);
          if (shouldBlacklist) {
            return originalPublicKey;
          }
        } else {
          //need to check to ensure no history mutation in case message already saved
          if (originalPublicKey != thisDB.getMessageIPFS(historyPull).publicKey) {
            console.log("History stealing!");
            return originalPublicKey;
          }

          break //assume have entire history
        }
      }
      return null;
    }
    return null;
  }


}
