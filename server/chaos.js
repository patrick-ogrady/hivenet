const crypto2 = require('crypto2');
const randomstring = require("randomstring");

const USEFUL_CONTENT_BROWSING = 0.2;
const USEFUL_ENTRIES = 50;

module.exports = function(agent, utils) {
  this.utils = utils; //needed to keep same proof set
  this.seenLastMessageIPFS = null;
  this.seenProofs = null;
  this.personalURLs = null;
  this.seenMessagesToSend = null;
  this.agent = agent; //needed for signing messages
  this.publicKey = agent.publicKey;
  this.urlsSent = [];

  this.observeMessage = async function(message) {
    const processedMessageTop = JSON.parse(message);
    const processedMessage = JSON.parse(processedMessageTop["messageToSend"]);
    this.seenMessagesToSend = processedMessage;
    this.seenProofs = processedMessage["proof"];
    const parsedPayload = JSON.parse(processedMessage["message"]["payload"]);
    if ("lastMessageIPFS" in parsedPayload) {
      this.seenLastMessageIPFS = parsedPayload["lastMessageIPFS"];
    }
  }

  this.createBadMessage = async function(IPFSNode, url, rating, lastMessageIPFS, OVERRIDE_NONCE, OVERRIDE_PROOF, OVERRIDE_MESSAGE_TO_SEND) {
    var rawPayload = {
      url:this.utils.cleanURL(url),
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

    const signature = await crypto2.sign.sha256(payload, this.agent.privateKey);
    // console.log("signature:", signature, "\n");

    const signedPayload = JSON.stringify({signature:signature, payload:payload});

    const signedPayloadHash = await crypto2.hash.sha256(signedPayload);
    // console.log("signed payload hash:", signedPayloadHash, "\n");

    const isSignatureValid = await crypto2.verify.sha256(payload, this.agent.publicKey, signature);
    // console.log("signature valid:", isSignatureValid, "\n");

    var {proofToUse, verifiedProof} = await this.utils.storeHashInChainpoint(signedPayloadHash);
    // console.log("signed hash proof:", proofToUse, "\n");

    if (OVERRIDE_PROOF) {
      proofToUse = OVERRIDE_PROOF;
    }

    //calculate nonce
    const proofHash = await crypto2.hash.sha256(proofToUse);
    // console.log("Finding Nonce for:", proofHash);
    var nonce = await this.utils.findNonce(proofHash);
    // console.log("Hash Leading Zeros", proofHash, await checkNonce(proofHash, nonce));

    if (OVERRIDE_NONCE) {
      nonce = OVERRIDE_NONCE;
    }

    var messageToSend = JSON.stringify({proof:proofToUse, nonce:nonce, message:{signature:signature, publicKey:this.agent.publicKey, payload:payload}});
    // console.log("message to send:", messageToSend, "\n");

    if (OVERRIDE_MESSAGE_TO_SEND) {
      messageToSend = JSON.stringify(OVERRIDE_MESSAGE_TO_SEND);
    }

    const entireSignature = await crypto2.sign.sha256(messageToSend, this.agent.privateKey);
    const fullMessageToSend = JSON.stringify({signature:entireSignature, publicKey:this.agent.publicKey, messageToSend:messageToSend});



    let IPFSHash = await this.utils.storeString(IPFSNode, fullMessageToSend);
    // console.log("MESSAGE IPFS:", IPFSHash);

    return {IPFSHash: IPFSHash, messageContents:fullMessageToSend};
  }

  this.createMaliciousURL = function() {
    return "http://www.suspicious.com/" + randomstring.generate(10);
  }

  this.createValidMessage = async function(IPFSNode) {
    var thisURL = this.createMaliciousURL();
    if (Math.random() < USEFUL_CONTENT_BROWSING) {
      //visit popular
      thisURL = "http://www.useful.com/" + Math.floor(Math.random() * USEFUL_ENTRIES).toString();

      if(this.urlsSent.includes(thisURL)) {
        console.log("BAD AGENT ALREADY SENT:", thisURL);
        thisURL = this.createMaliciousURL();
      }
    }
    this.urlsSent.push(thisURL);

    var {IPFSHash, messageContents} = await this.utils.createMessage(IPFSNode, thisURL, this.agent.getRating(), this.agent.lastMessageIPFS, this.agent.publicKey, this.agent.privateKey);
    this.personalURLs = thisURL;
    this.agent.lastMessageIPFS = IPFSHash;
    return [IPFSHash, messageContents];
  }

  this.createBadNonceMessage = async function(IPFSNode) {
    var {IPFSHash, messageContents} = await this.createBadMessage(IPFSNode, await this.agent.getRandomURL(), this.agent.getRating(), this.agent.lastMessageIPFS, "-1", null, null);
    this.agent.lastMessageIPFS = IPFSHash;
    return [IPFSHash, messageContents];
  }

  this.createBadRatingMessage = async function(IPFSNode) {
    var {IPFSHash, messageContents} = await this.createBadMessage(IPFSNode, await this.agent.getRandomURL(), 10, this.agent.lastMessageIPFS, null, null, null);
    this.agent.lastMessageIPFS = IPFSHash;
    return [IPFSHash, messageContents];
  }

  this.createBadProofMessage = async function(IPFSNode) {
    var {IPFSHash, messageContents} = await this.createBadMessage(IPFSNode, await this.agent.getRandomURL(), this.agent.getRating(), this.agent.lastMessageIPFS, null, this.seenProofs, null);
    this.agent.lastMessageIPFS = IPFSHash;
    return [IPFSHash, messageContents];
  }

  this.createHistoryMutationMessage = async function(IPFSNode) {
    var {IPFSHash, messageContents} = await this.createBadMessage(IPFSNode, await this.agent.getRandomURL(), this.agent.getRating(), null, null, null, null);
    this.agent.lastMessageIPFS = IPFSHash;
    return [IPFSHash, messageContents];
  }

  this.createStealHistoryMessage = async function(IPFSNode) {
    var {IPFSHash, messageContents} = await this.createBadMessage(IPFSNode, await this.agent.getRandomURL(), this.agent.getRating(), this.seenLastMessageIPFS, null, null, null);
    this.agent.lastMessageIPFS = IPFSHash;
    return [IPFSHash, messageContents];
  }

  this.createDuplicateRatingMessage = async function(IPFSNode) {
    var {IPFSHash, messageContents} = await this.createBadMessage(IPFSNode, this.personalURLs, this.agent.getRating(), this.agent.lastMessageIPFS, null, null, null);
    this.agent.lastMessageIPFS = IPFSHash;
    return [IPFSHash, messageContents];
  }

  this.createCopyInteriorMessage = async function(IPFSNode) {
    var {IPFSHash, messageContents} = await this.createBadMessage(IPFSNode, await this.agent.getRandomURL(), this.agent.getRating(), this.agent.lastMessageIPFS, null, null, this.seenMessagesToSend);
    this.agent.lastMessageIPFS = IPFSHash;
    return [IPFSHash, messageContents];
  }

  this.createUnreachableIPFSAddress = async function(IPFSNode) {
    const thisRandom = randomstring.generate(64);
    console.log("Randomly Generated String:", thisRandom);
    const unreachableIPFS = (await IPFSNode.files.add(Buffer.from(thisRandom), {onlyHash:true}))[0].hash;
    var {IPFSHash, messageContents} = await this.createBadMessage(IPFSNode, await this.agent.getRandomURL(), this.agent.getRating(), unreachableIPFS, null, null, null);
    this.agent.lastMessageIPFS = IPFSHash;
    return [IPFSHash, messageContents];
  }

  this.createInvalidIPFSAddress = async function(IPFSNode) {
    var {IPFSHash, messageContents} = await this.createBadMessage(IPFSNode, await this.agent.getRandomURL(), this.agent.getRating(), "ajsdkljaskldj", null, null, null);
    this.agent.lastMessageIPFS = IPFSHash;
    return [IPFSHash, messageContents];
  }

  this.createRandomBadMessage = async function(IPFSNode) {
    var typeAttack = Math.floor((Math.random() * 8));
    if (typeAttack == 0) {
      return await this.createBadNonceMessage(IPFSNode);
    } else if (typeAttack == 1) {
      return await this.createBadRatingMessage(IPFSNode);
    } else if (typeAttack == 2) {
      return await this.createBadProofMessage(IPFSNode);
    } else if (typeAttack == 3) {
      return await this.createHistoryMutationMessage(IPFSNode);
    } else if (typeAttack == 4) {
      return await this.createStealHistoryMessage(IPFSNode);
    } else if (typeAttack == 5 && this.personalURLs) {
      return await this.createDuplicateRatingMessage(IPFSNode);
    } else if (typeAttack == 6) {
      return await this.createCopyInteriorMessage(IPFSNode);
    } else if (typeAttack == 7) {
      return await this.createInvalidIPFSAddress(IPFSNode);
    } else {
      return await this.createValidMessage(IPFSNode);
    }
  }
  //different attack modifications


}
