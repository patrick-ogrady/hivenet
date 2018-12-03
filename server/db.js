// function constructor
const loki = require('lokijs');
const cryptr = require('cryptr');
const jsrecommender = require("./jsrecommender");

function db(IPFSNode, publicKey, privateKey, dbBackedUp) {
  this.IPFSNode = IPFSNode;
  this.publicKey = publicKey
  this.privateKey = privateKey;
  this.timeoutLimit = timeoutLimit;
  this.newDBBackup = dbBackedUp;

  //DB COLLECTIONS
  this.messages = null;
  this.blacklistPeers = null;
  this.recommendations = null;

  this.lokiDB = new loki('sandbox', {
    adapter: {
      mode:"reference",
      saveDatabase: (dbname, dbstring, callback) => {
        this.saveDatabase(dbname, dbstring, callback);
      },
      loadDatabase: (dbname, callback) => {
        this.loadDatabase(dbname, callback);
      }
    }
  });

  this.saveDatabase = function(dbname, dbstring, callback) {
      this.encryptAndStoreString(dbstring, (error, ipfs_address) => {
        if (error) {
          callback(new Error("An error was encountered loading database."));
        } else {
          this.newDBBackup(ipfs_address);
          callback(null);
        }
      });
  }


  this.loadDatabase = function(dbname, callback) {
    console.log("CURRENT BACKUP IPFS ADDRESS:", this.dbBackup);
    this.getAndDecryptString(this.dbBackup, function(error, decryptedFile) {
      if (error) {
        callback(new Error("There was a problem loading the database"));
      } else {
        callback(decryptedFile);
      }
    });
  }

  this.encryptAndStoreString = function(input_string, callback) {
    const encrypter = new cryptr(this.privateKey);
    const encryptedString = encrypter.encrypt(input_string);
    this.IPFSNode.files.add({
      content: Buffer.from(encryptedString)
    }, function(err, res) {
      if (err) {
        callback(err, "");
      } else {
        callback("", res[0].hash);
      }
    })
  }

  this.getAndDecryptString = function(ipfs_address, callback) {
    try {
      const encrypter = new cryptr(this.privateKey);
      this.IPFSNode.pin.add(ipfs_address, (err) => {
        if (err) {
          callback(err, "");
        } else {
          this.IPFSNode.files.cat(ipfs_address, function(err, file) {
            if (err) {
              callback(err, "");
            } else {
              const decrypted_file = encrypter.decrypt(file.toString());
              callback("", decrypted_file);
            }
          });
        }
      });
    } catch (err) {
      callback(err, "");
    }
  }

  this.getCollection = function(collectionName, uniqueCol) {
    var toReturn = this.lokiDB.getCollection(collectionName);
    if (!toReturn) {
      console.log("Must Create", collectionName, uniqueCol);
      if (uniqueCol) {
        return this.lokiDB.addCollection(collectionName, {
          unique:[uniqueCol]
        });
      } else {
        return this.lokiDB.addCollection(collectionName);
      }
    } else {
      return toReturn;
    }
  }

  //TODO: FORMALIZE MESSAGES DB -> IPFS HASH:PUBLIC_KEY:URL:HOSTNAME:RATING:PROOF:TIMESTAMP
  this.restoreDatabase = async function(dbBackup) { //must run before starting
    this.dbBackup = dbBackup;
    let promise = new Promise((resolve, reject) => {
      if (this.dbBackup != null) {
        this.lokiDB.loadDatabase({}, () => {
          resolve(true);
        });
      } else {
        resolve(false);
      }
    });

    let dbExists = await promise;

    this.messages = this.getCollection('messages', 'messageIPFS');
    this.blacklistPeers = this.getCollection('blacklistPeers', 'publicKey');
    this.recommendations = this.getCollection('recommendations', 'address');
    return dbExists;

  }

  this.backupDatabase = async function(callback) {
    let promise = new Promise((resolve, reject) => {
      this.lokiDB.saveDatabase(() => {
        resolve();
      });
    });
  }

  this.checkIfAlreadyRated = function(publicKey, url) {
    return this.messages.chain().find({'$and': [{'url':url}, {'publicKey':publicKey}]}).data().length > 0;
  }




  //DB OPS
  this.addBlacklistPeer = function(publicKey) { //added unique specifier
    try {
      this.blacklistPeers.insert({
        publicKey:publicKey
      });

      //remove all messages from peer
      this.messages.chain().find({'publicKey' : publicKey}).remove();
    } catch (error) {
      console.log("Can't add to blacklistPeers!", error);
    }
  }

  this.checkBlacklistPeer = function(publicKey) {
    return this.blacklistPeers.chain().find({'publicKey' : publicKey}).data().length > 0;
  }

  this.checkMessageIPFS = function(messageIPFS) {
    return this.messages.chain().find({'messageIPFS' : messageIPFS}).data().length > 0;
  }


  this.cleanURL = function(url) {
    return url;
  }

  this.addMessage = function(message) {
    try {
      //don't store work or proof in DB
      this.messages.insert({
        publicKey:message.publicKey,
        creationTime:message.creationTime,
        rating:message.rating,
        url:message.url,
        messageIPFS:message.messageIPFS
      });
    } catch (error) {
      console.log("Can't add to messages!", error);
    }
  }

  //TODO: SERIAL EVENT PROCESSING: https://stackoverflow.com/questions/39044183/serially-processing-a-queue-of-messages-whose-processing-is-async
  this.inProcess = false;
  this.messageQueue = [];

  this.attemptPreviousMessage = async function(historicalPublicKey, IPFSaddress) {
    if(this.checkMessageIPFS(IPFSaddress) == false) {
      let IPFSText = await messagesObject.getPreviousMessage(IPFSaddress);
      console.log("PREVIOUS IPFS Text:", IPFSText);
      const parsedMessage = await messagesObject.parseMessage(IPFSText);
      console.log("PREVIOUS Parsed Message:", parsedMessage);
      this.processMessageQueue(parsedMessage, historicalPublicKey);
    }
  }

  //message passed in should already be parsed...just adding
  this.processMessageQueue = function(message, historicalPublicKey) {
    //historical message is a boolean indicating if older message
    if (!this.inProcess) {
      console.log("Nothing in process!");
      this.processMessage(message, historicalPublicKey);
    } else {
      console.log("Message in Queue:", this.messageQueue.length);
      this.messageQueue.push([message, historicalPublicKey]);
    }
  }

  this.endProcessMessage = function() { //used as a return function if stop early
    if (this.messageQueue.length) {
      // pull out oldest message and process it
      var nextMessage = this.messageQueue.shift();
      this.processMessage(nextMessage[0], nextMessage[1]);
    } else {
      //in the case that there is a race condition something could sit in messaging slightly too long
      this.inProcess = false;
    }
  }

  this.processMessage = function(message, historicalPublicKey) { //input message should not be a IPFS address (otherwise would have to poll IPFS for every incoming message)
    this.inProcess = true;

    /** message should be an already validated dictionary object returned from messages.parseMessage
    {
      creationTime,
      recievedTime,
      publicKey,
      rating,
      url,
      messageIndex,
      messageIPFS,
      lastMessageIPFS (optional)
    };
    **/

    //check if already rated
    if (this.checkIfAlreadyRated(message.publicKey, message.url)) {
      console.log("ALREADY RATED CONTENT!", message.publicKey, message.url);
      this.endProcessMessage();
      return;
    }

    if (message.publicKey != this.publicKey) {
      //check if creationTime is within Y seconds of recievedTime (unless processing a chain)
        //drop message
      if (historicalPublicKey == null) {
        var oldness = (new Date(message.recievedTime) - new Date(message.creationTime))/1000;
        if (oldness > this.timeoutLimit) {
          console.log("DROPPING MESSAGE FOR TIMEOUT:", message.messageIPFS, oldness);
          this.endProcessMessage();
          return;
        }
      } else {
        //ensure parent message has same public key that provided, otherwise blacklist
        if (historicalPublicKey != message.publicKey) {
          this.addBlacklistPeer(historicalPublicKey);
          console.log("HISTORICAL PUBLIC KEY IMPERSONATOR:", historicalPublicKey, message.publicKey);
          this.endProcessMessage();
          return;
        }
      }

      //check if publicKey in blacklistPeers
        //drop message
      if (this.checkBlacklistPeer(message.publicKey)) {
        console.log("DROPPING MESSAGE FOR BLACKLIST PEER:", message.publicKey);
        this.endProcessMessage();
        return;
      }

      //check if messageIPFS already stored in messages
        //drop message
      if (this.checkMessageIPFS(message.messageIPFS)) {
        console.log("DROPPING MESSAGE AS REPEAT:", message.messageIPFS);
        this.endProcessMessage();
        return;
      }

      //check if messageIndex for publicKey already stored
        //blacklist -> personal fork detected
      if (this.checkMessageIndex(message.messageIndex)) {
        console.log("DROPPING MESSAGE AS REPEAT INDEX AND BLACKLISTING PEER FOR FORK:", message.messageIndex, message.publicKey);
        this.addBlacklistPeer(message.publicKey);
        this.endProcessMessage();
        return;
      }

      //check if rated 1 and on blacklist -> blacklist peer
      if (message.rating == 1 && this.checkIfBlacklist(message.url)) {
        console.log("DROPPING MESSAGE AS BLACKLISTED AND BLACKLISTING PEER FOR MALICIOUS CONTENT DISTRIBUTION:", message.messageIndex, message.publicKey);
        this.addBlacklistPeer(message.publicKey);
        this.endProcessMessage();
        return;
      }

      //check if message history now means that two messages were proof marked
      //less than X seconds apart
        //blacklist -> attack detected
      //get message within timeout of rating
      if (this.getMessageDifference(message.publicKey, message.creationTime)) {
        console.log("DROPPING MESSAGE AS TOO FREQUENT AND BLACKLISTING PEER FOR DOS:", message.messageIndex, message.publicKey);
        this.addBlacklistPeer(message.publicKey);
        this.endProcessMessage();
        return;
      };

      //attempt previous message fetch
      if (message.lastIPFS) {
        this.attemptPreviousMessage(message.publicKey, message.lastIPFS);
      }

      //addToDB
      this.addMessage(message);

      //Broadcast (unless processing a chain...would get dropped by other clients because old message)
      if (historicalPublicKey == null) {
        //broadcast
        console.log("SHOULD REBROADCAST:", message)
      }
    } else { //means that we sent
      console.log("MESSAGE FROM SELF!!!");
      //addToDB
      this.addMessage(message);

      //if message rating == -1: added to blacklist (need to remove from whitelist and all nodes that rated as 1)
      if (message.rating == -1) {
        this.addedBlacklist(message.url);
      }

    }

    //TODO: only rebroadcast if on whitelist (maybe?)

    console.log("All messages:", this.messages.chain().data());

    this.endProcessMessage();
    return;
  }

  //UNSEEN RISK SCORE

  this.getOldestSeen = function(address) {
    var resultSetData = this.messages.chain().find({'address':address}).simplesort('creationTime').limit(1).data();
    if (resultSetData.length > 0) {
      return resultSetData[0];
    } else {
      return null;
    }
  }

  this.getUserCountOldestRatedAddresses = function() {
    //get oldest ratings for all ratings = 1 by self
    var allPublicKeyRatings = this.messages.chain().find({'publicKey':this.publicKey}).data();
    var allCount = {};
    for (rating in allPublicKeyRatings) {
      var oldestSeenRating = this.getOldestSeen(allPublicKeyRatings[rating].address);
      console.log(oldestSeenRating.publicKey, oldestSeenRating.address, oldestSeenRating.creationTime);
      if (oldestSeenRating.publicKey == this.publicKey) {
        //self
        continue;
      }
      if (!allCount[oldestSeenRating.publicKey]) {
        allCount[oldestSeenRating.publicKey] = 0
      }
      allCount[oldestSeenRating.publicKey] += 1
    }

    return allCount;
  }

  this.getNewAddressRisk = function(hostname) {
    const userCounts = this.getUserCountOldestRatedAddresses();
    var totalPoints = 0;
    var totalScore = 0;
    for (userPublicKey in userCounts) {
      var result = this.messages.chain().find({'$and': [{'publicKey' : userPublicKey},{'hostname' : hostname}, {'rating' : -1}]}).data()
      if (result.length > 0) {
        totalScore += userCounts[userPublicKey];
      }
      totalPoints += userCounts[userPublicKey];
    }

    return totalScore/totalPoints;
  }

  //GET RECOMMENDATION
  this.getUniqueWhitelistHostnames = function() {
    var result = this.whitelist.mapReduce(function(obj) {
    	return obj.hostname;
    }, function(arr) {
    	var ret = [], len = arr.length;
        for(var i = 0; i < len; i++) {
            if(ret.indexOf(arr[i]) === -1) {
                ret.push(arr[i]);
            }
        }
        return ret;
    });
    return result;
  }



  this.getRatingsForHostnames = function(hostnames) {
    return this.messages.find({ 'hostname' : { '$in' : hostnames } })
  }

  function calculateRecommendations(publicKey) {
    this.recommendations.chain().remove()
    var allUniqueHostnames = this.getUniqueWhitelistHostnames();

    var applicableRatings = this.getRatingsForHostnames(allUniqueHostnames);

    var recommender = new jsrecommender.Recommender();
    var table = new jsrecommender.Table();

    for (rating in applicableRatings) {
      var thisRating = applicableRatings[rating];
      table.setCell(thisRating.address, thisRating.publicKey, thisRating.rating);
    }

    var model = recommender.fit(table);

    var predicted_table = recommender.transform(table);
    var urls_to_view = [];

    for (var j = 0; j < predicted_table.rowNames.length; ++j) {
      var url_string = predicted_table.rowNames[j];
      if (table.containsCell(url_string, this.publicKey) == false) {
        recommendations.insert({
          address:url_string,
          score:predicted_table.getCell(url_string, this.publicKey)
        });
      }
    }
  }

  this.getRecommendation = function() {
    var resultSet = this.recommendations.chain().simplesort('score').limit(1);
    var resultSetData = resultSet.data();
    if (resultSetData.length > 0) {
      resultSet.remove()
      return resultSetData[0];
    } else {
      return null;
    }
  }
}

module.exports = db;
