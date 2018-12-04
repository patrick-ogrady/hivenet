
const crypto2 = require('crypto2');
const simpledb = require('./simpledb.js');
var fs = require('fs');
var shuffle = require('shuffle-array');

async function createKeys() {
  const { privateKey, publicKey } = await crypto2.createKeyPair();
  return {publicKey:publicKey, privateKey:privateKey};
}

function agent() {
  this.initialize = async function() {
    var {publicKey, privateKey} = await createKeys();
    this.publicKey = publicKey;
    this.privateKey = privateKey;
    this.db = new simpledb();
    this.lastMessageIPFS = null;
    this.urls = null;

    this.seenURLs = []; //used to speed up recommendation process

    let promise = new Promise((resolve, reject) => {
      fs.readFile( __dirname + '/wiki.txt', function (err, data) {
        if (err) {
          throw err;
        }
        resolve(JSON.parse(data.toString()));
      });
    });

    var urls = await promise; //stock with 150 random wiki articles
    this.urls = urls;
    shuffle(this.urls);
  }

  this.getRandomURL = function() {
    shuffle(this.seenURLs);
    if (Math.floor((Math.random() * 10) + 1) < 5) {
      return this.urls.pop();
    } else {
      return this.seenURLs.pop();
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
