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

//BASIC INIT
figlet('HIVENET', function(err, data) {
    if (err) {
        console.log('Something went wrong...');
        console.dir(err);
        return;
    }
    console.log(data);
    startUp();
});

const chp = require('chainpoint-client')

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


async function startUp() {

  if (conf.has('publicKey') == false) {
    console.log("CREATING KEY PAIRS");
    const { privateKey, publicKey } = await crypto2.createKeyPair();
    conf.set('publicKey', publicKey);
    conf.set('privateKey', privateKey);
    console.log("Public Key:", publicKey, "\n");
  } else {
    console.log("KEY PAIRS ALREADY EXIST");
  }

  const publicKey = conf.get('publicKey');
  const privateKey = conf.get('privateKey');


  const payload = JSON.stringify({url:"https://www.cnn.com", rating:1});
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

  const messageToSend = JSON.stringify({proof:messageProof, message:{signature:signature, payload:payload}});
  console.log("message to send:", messageToSend);
}
