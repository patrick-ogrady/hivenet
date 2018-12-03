const chp = require('chainpoint-client');
const crypto2 = require('crypto2');
const hexToBinary = require('hex-to-binary');
const bigInt = require("big-integer");

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

async function findNonce(proofHash) {
  var nonce = bigInt("0");
  var bestLeadingZeros = -1;
  var start = new Date().getTime();
  while (true) {
    const leadingZeros = await checkNonce(proofHash, nonce.toString());
    if (leadingZeros  > bestLeadingZeros) {
      bestLeadingZeros = leadingZeros;
      if (bestLeadingZeros >= 25) {
        var end = new Date().getTime();
        var time = (end - start);
        console.log("***FINISHED***","Current Nonce:", nonce.toString(), "Best Leading Zeros:", bestLeadingZeros, "Time Elapsed:", time/1000, "Hash/s:", nonce.divide(time).multiply(1000).toString());
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


async function performTest() {
  const hashContent = "testing123";
  const hash = await crypto2.hash.sha256(hashContent);
  console.log(hashContent, hash);

  const {proofToUse, verifiedProof} = await storeHashInChainpoint(hash);
  console.log(proofToUse, verifiedProof);
  const proofHash = await crypto2.hash.sha256(proofToUse);
  console.log("Finding Nonce for:", proofHash);
  const nonce = await findNonce(proofHash);
  console.log("Hash Leading Zeros", proofHash, await checkNonce(proofHash, nonce));
}

performTest();

// findNonce("eJyNkz1uFEEQhTkChyBkvf3f1RNZ4gpETlbVVdXsSMvMamdsIDQkpA44ANjIBpEgIULusRKHoWe9GNkGiYlG3f2+fv2q6u3VIfXdKC/HH8txXA/NfP7CtnzQb57NaYltt+7bbpyf2Ivx1Vo+P7lZuljisNweZjCmaGLDVCiAzy4KWLEJlIFU2DOILcUiGJZiHEfWHCBnE41ka75MmEXLi65n2T5K4JMDVrMSDc20FphhRjtTGo2NEotS8H0nGY7z83Yc5Vq5wPGbURpm2syUfaqh8aax7ugGT/1mwiftA8ktvA2+4lOKko3xKHfxk/LveH90lTfY0VKGs9cfV5hl9ZVwtZiW+s3ieu+8Xw8/Hzw8fb/aPt45bbn5n1eefujXl8MSZ8aHnXjnYxL/xxvuit917TCemEZ7ZyFYbVT9GmWxls3XciCW4DHqnEk7lSikYG1SWCRpVSoZIlhLQoiOTNaWubqAlDMmRNLibCi1nB4yi3BIokSzK84RQK4ntddGSqn4DI60BkYKt11utofs6ttjFtBI4IKOyXvrNFgTQQNSqZwUi1VKC2OgbHyE6kAVYudTvgfMBYAInQ7AznBR5F2MVC2hipKSRJNiCD7WJk4xZq6bqiZgyMUEhe4BY61byb5Gzy6YysneYdExeBeSqbEmX/MgVf9KzpI8+2oXC5gsjkq8W5hkppy1uqlM8I1ufk8iHvwZwWkim9pdzV6xs0NiA9WgSlYYonIm1PsDqGA5iK45q5iJQ3Ql+gTZBXYoNU1MkJhJ3bJzed23w9mb3ayf18s+7Vu55cv9tRfHm3Y42x78y+K8qqRj3Mz3gvk0Tr8AdMZs9g==")
