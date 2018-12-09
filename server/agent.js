const crypto2 = require('crypto2');
const simpledb = require('./simpledb.js');
var fs = require('fs');
var shuffle = require('shuffle-array');
const randomstring = require("randomstring");

async function createKeys() {
  const { privateKey, publicKey } = await crypto2.createKeyPair();
  return {publicKey:publicKey, privateKey:privateKey};
}

function agent(agentSimilarity) {
  this.initialize = async function() {
    var {publicKey, privateKey} = await createKeys();
    this.publicKey = publicKey;
    this.privateKey = privateKey;
    this.db = new simpledb(this.publicKey);
    this.lastMessageIPFS = null;
    this.currentUsefulCount = 0;
    this.agentSimilarity = agentSimilarity;
  }

  this.getRandomURL = async function() {
    if (Math.random() < this.agentSimilarity) {
      //visit popular
      this.currentUsefulCount += 1
      return "http://www.useful.com/" + (this.currentUsefulCount - 1).toString()
    } else {
      return "http://www.personal.com/" + randomstring.generate(10);
    }

  }

  this.getRating = function() {
    if (Math.random() > 0.5) {
      return 1;
    } else {
      return 0;
    }
  }

}

module.exports = agent;
