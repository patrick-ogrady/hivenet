// function constructor
const loki = require('lokijs');
const cryptr = require('cryptr');
const jsrecommender = require("./jsrecommender");

function simpledb() {
  this.lokiDB = new loki('sandbox');

  this.getCollection = function(collectionName, uniqueCol) {
    var toReturn = this.lokiDB.getCollection(collectionName);
    if (!toReturn) {
      // console.log("Must Create", collectionName, uniqueCol);
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

  this.changesSinceNewRecommendations = 0;

  this.messages = this.getCollection('messages', 'messageIPFS');
  this.blacklistPeers = this.getCollection('blacklistPeers', 'publicKey');
  this.recommendations = this.getCollection('recommendations', 'address');

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

  this.checkIfAlreadyRated = function(publicKey, url) {
    return this.messages.chain().find({'$and': [{'url':url}, {'publicKey':publicKey}]}).data().length > 0;
  }

  this.checkBlacklistPeer = function(publicKey) {
    return this.blacklistPeers.chain().find({'publicKey' : publicKey}).data().length > 0;
  }

  this.checkMessageIPFS = function(messageIPFS) {
    return this.messages.chain().find({'messageIPFS' : messageIPFS}).data().length > 0;
  }

  this.checkMessagePastValid = function(lastMessageIPFS, publicKey) {
    return this.messages.chain().find({'$and': [{'lastMessageIPFS':lastMessageIPFS}, {'publicKey':publicKey}]}).data().length > 0;
  }

  this.addMessage = function(selfPublicKey, message) {
    try {
      //check to see if message already exists in DB
      if (this.checkMessageIPFS(message.messageIPFS)) {
        console.log("Message already in DB!", message.messageIPFS);
        return null;
      }

      //check to see if public key blacklisted
      if (this.checkBlacklistPeer(message.publicKey)) {
        console.log("Peer Blacklisted!", message.publicKey);
        return null;
      }

      //check to see if multiple messages with same last messageID
      if (this.checkMessagePastValid(message.lastMessageIPFS, message.publicKey)) {
        console.log("Multiple messages with lastMessageIPFS!");
        return false; //should blacklist
      }

      //check to see if public key already rated URL
      if (this.checkIfAlreadyRated(message.publicKey, message.url)) {
        console.log("URL already rated by publicKey!");
        return false; //should blacklist (can't change ratings)
      }

      //don't store work or proof in DB
      this.messages.insert({
        publicKey:message.publicKey,
        creationTime:message.creationTime,
        rating:message.rating,
        url:message.url,
        lastMessageIPFS:message.lastMessageIPFS,
        messageIPFS:message.messageIPFS
      });

      this.changesSinceNewRecommendations += 1;

      //update recommendations
      if (this.recommendations.chain().data().length == 0) { //|| this.changesSinceNewRecommendations > 5
        this.changesSinceNewRecommendations = 0;
        this.calculateRecommendations(selfPublicKey);
      }


      return true;
    } catch (error) {
      console.log("Can't add to messages!", error);
    }
  }



  //Calculate Risk Score
  this.getOldestSeen = function(url) {
    var resultSetData = this.messages.chain().find({'url':url}).simplesort('creationTime').limit(1).data();
    if (resultSetData.length > 0) {
      return resultSetData[0];
    } else {
      return null;
    }
  }

  this.getPeerReputations = function(notIncludingPublicKey) {
    //get oldest ratings for all ratings = 1 by self
    var allPublicKeyRatings = this.messages.chain().find({'$and': [{'rating':1}, {'publicKey':notIncludingPublicKey}]}).data();
    var allCount = {};
    var totalReputation = 0;
    for (rating in allPublicKeyRatings) {
      var oldestSeenRating = this.getOldestSeen(allPublicKeyRatings[rating].url);
      // console.log(oldestSeenRating.publicKey, oldestSeenRating.url, oldestSeenRating.creationTime);
      if (oldestSeenRating.publicKey == notIncludingPublicKey) {
        //self
        continue;
      }
      if (!allCount[oldestSeenRating.publicKey]) {
        allCount[oldestSeenRating.publicKey] = 0
      }
      allCount[oldestSeenRating.publicKey] += 1
      totalReputation += 1;
    }

    return {peerReputations:allCount, totalReputation:totalReputation};
  }

  this.getURLRiskScore = function(selfPublicKey, url) {
    if (this.checkIfAlreadyRated(selfPublicKey, url)) {
      console.log("Self already rated!")
      return 0; //means user already rated
    }

    //if haven't yet rated
    const {peerReputations, totalReputation} = this.getPeerReputations(selfPublicKey);

    var reputationFor = 0;
    for (var key in peerReputations) {
      var fetchedMessages = this.messages.chain().find({'$and': [{'url':url}, {'rating':1}, {'publicKey':key}]}).data().length > 0;
      if (fetchedMessages) {
        reputationFor += peerReputations[key];
      }
    }
    if (totalReputation == 0) {
      return 1;
    }

    return 1 - reputationFor/totalReputation;
  }

  this.calculateRecommendations = function(publicKey) {

    this.recommendations.chain().remove();

    var applicableRatings = this.messages.chain().data(); //update to restrict via score

    console.log("Calculating New Recommendations on ", applicableRatings.length, " items");

    var recommender = new jsrecommender.Recommender();
    var table = new jsrecommender.Table();

    for (rating in applicableRatings) {
      var thisRating = applicableRatings[rating];
      table.setCell(thisRating.url, thisRating.publicKey, thisRating.rating);
    }

    var model = recommender.fit(table);

    var predicted_table = recommender.transform(table);
    var urls_to_view = [];

    for (var j = 0; j < predicted_table.rowNames.length; ++j) {
      var url_string = predicted_table.rowNames[j];
      if (table.containsCell(url_string, publicKey) == false) {
        this.recommendations.insert({
          url:url_string,
          score:predicted_table.getCell(url_string, publicKey)
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

module.exports = simpledb;
