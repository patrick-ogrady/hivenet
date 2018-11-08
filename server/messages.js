const Configstore = require('configstore');
const pkg = require('./package.json');
const conf = new Configstore(pkg.name);
const chp = require('chainpoint-client');

const cryptr = require('cryptr');
const crypto2 = require('crypto2');

function messages(IPFSNode, conf) {
  this.IPFSNode = IPFSNode;
  this.conf = conf;
  this.storeHashInChainpoint = async function(hashToStore) {

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

  this.verifyProofInChainpoint = async function(proof) {
    let verifiedProofs = await chp.verifyProofs([proof])
    console.log("Verified Proof Objects: Expand objects below to inspect.")
    console.log(verifiedProofs)

    if (verifiedProofs.length > 0) {
      return verifiedProofs[0]["hashSubmittedCoreAt"];
    } else {
      return null;
    }
  }

  this.inProcess = false;
  this.messageQueue = [];
  this.createMessageQueue = function (url, rating) {
    if (!this.inProcess) {
      console.log("Nothing in process!");
      this.createMessage(url, rating);
    } else {
      console.log("Message in Queue:", this.messageQueue.length);
      this.messageQueue.push([url, rating]);
    }
  }

  this.goalDelay = 60;

  this.createMessage = async function (url, rating) {
    /**
    {
      proof:messageProof,
      message:{
        signature:signature,
        publicKey:,
        payload:{
          url:,
          rating:,
          lastMessageIPFS:(don't put in payload if no prior messages),
          messageIndex:(ensureStrictOrderOfMessages)
        }
      }
    }
    **/

    this.inProcess = true;

    if (this.conf.has('messageIndex') == false) {
      this.conf.set('messageIndex', 0);
    }

    var rawPayload = {
      url:url,
      rating:rating,
      messageIndex:this.conf.get('messageIndex')
    };

    if (this.conf.has('lastIPFS') == true) {
      rawPayload["lastMessageIPFS"] = this.conf.get('lastIPFS');
    };

    const payload = JSON.stringify(rawPayload);
    this.conf.set('messageIndex', this.conf.get('messageIndex') + 1);
    console.log("payload:", payload, "\n");

    const signature = await crypto2.sign.sha256(payload, this.conf.get('privateKey'));
    console.log("signature:", signature, "\n");

    const signedPayload = JSON.stringify({signature:signature, payload:payload});

    const signedPayloadHash = await crypto2.hash.sha256(signedPayload);
    console.log("signed payload hash:", signedPayloadHash, "\n");

    const isSignatureValid = await crypto2.verify.sha256(payload, this.conf.get('publicKey'), signature);
    console.log("signature valid:", isSignatureValid, "\n");

    const {proofToUse, verifiedProof} = await this.storeHashInChainpoint(signedPayloadHash);
    console.log("signed hash proof:", proofToUse, "\n");

    const messageToSend = JSON.stringify({proof:proofToUse, message:{signature:signature, publicKey:this.conf.get('publicKey'), payload:payload}});
    console.log("message to send:", messageToSend, "\n");

    // const valid_message = await this.parseMessage(messageToSend);
    // console.log("Valid Message:", valid_message);

    //add to ipfs
    let promise = new Promise((resolve, reject) => {
      this.IPFSNode.files.add({
        content: Buffer.from(messageToSend)
      }, (err, res) => {
        resolve(res[0].hash);
      });
    });

    let IPFSHash = await promise;
    this.conf.set('lastIPFS', IPFSHash);
    console.log("MESSAGE IPFS:", IPFSHash);

    await this.sendMessage(messageToSend);

    var timeSinceCreation = (new Date() - new Date(verifiedProof["hashSubmittedCoreAt"]))/1000;
    var timeToWait = this.goalDelay - timeSinceCreation;
    console.log("Time to wait:", timeToWait);
    setTimeout(() => {
      if (this.messageQueue.length) {
        // pull out oldest message and process it
        var nextMessage = this.messageQueue.shift();
        this.createMessage(nextMessage[0], nextMessage[1]);
      } else {
        //in the case that there is a race condition something could sit in messaging slightly too long
        this.inProcess = false;
      }
    }, 1000 * timeToWait);
  }


  this.parseMessage = async function(recievedMessage) { //returns null if not valid, otherwise creation time
    const parsedMessage = JSON.parse(recievedMessage);

    if ("proof" in parsedMessage) {
      const creationTime = await this.verifyProofInChainpoint(parsedMessage["proof"]);
      if (creationTime != null) {
        if ("message" in parsedMessage) {
          if ("signature" in parsedMessage["message"] && "publicKey" in parsedMessage["message"] && "payload" in parsedMessage["message"]) {
            const isSignatureValid = await crypto2.verify.sha256(parsedMessage["message"]["payload"], parsedMessage["message"]["publicKey"], parsedMessage["message"]["signature"]);
            if (isSignatureValid == true) {
              const timeSinceCreation = (new Date() - new Date(creationTime))/1000;
              console.log("Time Since Creation(s):", timeSinceCreation);
              if (parsedMessage["message"]["publicKey"] == this.conf.get('publicKey')) {
                console.log("WARNING THIS MESSAGE FROM SELF!");
              }
              const parsedPayload = JSON.parse(parsedMessage["message"]["payload"]);
              var toReturn = {
                creationTime:creationTime,
                publicKey:parsedMessage["message"]["publicKey"],
                rating:parsedPayload["rating"],
                url:parsedPayload["url"],
                messageIndex:parsedPayload["messageIndex"],
              };
              if (parsedPayload["lastMessageIPFS"]) {
                toReturn["lastMessageIPFS"] = parsedPayload["lastMessageIPFS"]
              }
              let promise = new Promise((resolve, reject) => {
                this.IPFSNode.files.add({
                  content: Buffer.from(recievedMessage)
                },{onlyHash:true}, (err, res) => {
                  resolve(res[0].hash);
                });
              });
              let messageIPFS = await promise;
              toReturn["messageIPFS"] = messageIPFS;
              return toReturn;
            } else {
              return null;
            }
          } else {
            console.log("SIGNATURE, PUBLICKEY, OR PAYLOAD MISSING!");
            return null;
          }
        } else {
          console.log("MESSAGE MISSING!");
          return null;
        }
      } else {
        console.log("CREATION TIME IS NULL!");
        return null;
      }
    } else {
      console.log("NO PROOF PRESENT!");
      return null;
    }
  }


  this.getPreviousMessage = async function(IPFSAddressHash, callback) {
    let promise = new Promise((resolve, reject) => {
      this.IPFSNode.files.cat(IPFSAddressHash, function(err, file) {
        if (err) {
          reject(err);
        } else {
          resolve(file.toString());
        }
      });
    });
    return await promise;
  }

  this.sendMessage = async function(messageToSend) {
    //TODO: SEND MESSAGE ON IPFS PUBSUB
    console.log("Should send message!:", messageToSend);
  }
}

module.exports = messages;
