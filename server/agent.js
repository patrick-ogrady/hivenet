const crypto2 = require('crypto2');
const simpledb = require('./simpledb.js');
var fs = require('fs');
var shuffle = require('shuffle-array');

async function createKeys() {
  const { privateKey, publicKey } = await crypto2.createKeyPair();
  return {publicKey:publicKey, privateKey:privateKey};
}

const USEFUL_CONTENT_BROWSING = 0.7;
function agent() {
  this.initialize = async function() {
    var {publicKey, privateKey} = await createKeys();
    this.publicKey = publicKey;
    this.privateKey = privateKey;
    this.db = new simpledb(this.publicKey);
    this.lastMessageIPFS = null;
  }

  this.getRandomURL = async function() {
    if (Math.random() < USEFUL_CONTENT_BROWSING) {
      //visit popular
      return "http://www.useful.com/" + Math.floor(Math.random() * 100).toString();
    } else {
      var thisRec = await this.db.getRecommendation([]);
      console.log("Recommendation:", thisRec);
      return thisRec;
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
