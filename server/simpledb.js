// function constructor
const loki = require('lokijs');
const cryptr = require('cryptr');
var wget = require('node-wget');
const jsrecommender = require("./jsrecommender");

const MAX_RISK_TOLERANCE = 0.5;
const RANDOM_TRY_URL = 0.0;
const MINIMUM_REPUTATION_ASSIGNED_BEFORE_RECOMMENDATIONS = 5;

function simpledb(thisPublicKey) {
  this.publicKey = thisPublicKey;
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


  this.messages = this.getCollection('messages', 'messageIPFS');
  this.blacklistPeers = this.getCollection('blacklistPeers', 'publicKey');
  this.recommendations = this.getCollection('recommendations', 'url');

  this.produceCollectionArray = function(collection) {
    var allData = collection.chain().data();
    var cleanedArray = [];
    for (i in allData) {
      var thisItem = allData[i];
      delete thisItem.meta;
      delete thisItem["$loki"]
      cleanedArray.push(thisItem);
    }
    return cleanedArray;
  }

  this.backupDB = async function() {
    //export JSON object of entire DB
    var backupObject = {
      messages:this.produceCollectionArray(this.messages),
      blacklistPeers:this.produceCollectionArray(this.blacklistPeers),
      recommendations:this.produceCollectionArray(this.recommendations)
    }

    return JSON.stringify(backupObject);

  }

  this.importBackupArray = function(collection, arr) {
    for (i in arr) {
      try {
        collection.insert(arr[i]);
      } catch (error) {
        console.log("ERROR:", error);
      }

    }
  }

  this.restoreDB = async function(backupString) {
    //delete all
    this.lokiDB = new loki('sandbox');
    this.messages = this.getCollection('messages', 'messageIPFS');
    this.blacklistPeers = this.getCollection('blacklistPeers', 'publicKey');
    this.recommendations = this.getCollection('recommendations', 'url');

    const parsedDB = JSON.parse(backupString);
    this.importBackupArray(this.messages, parsedDB.messages);
    this.importBackupArray(this.blacklistPeers, parsedDB.blacklistPeers);
    this.importBackupArray(this.recommendations, parsedDB.recommendations);
  }

  //DB OPS
  this.addBlacklistPeer = function(publicKey) { //added unique specifier
    console.log("BLACKLIST:", publicKey);
    try {
      this.blacklistPeers.insert({
        publicKey:publicKey
      });

      //remove all messages from peer
      this.messages.chain().find({'publicKey' : publicKey}).remove();

    } catch (error) {
      //means already in blacklist
      // console.log("Can't add to blacklistPeers!", error);
    }
  }

  this.getAllBlacklistedPeers = function() {
    return this.blacklistPeers.chain().data();
  }

  this.clearBlacklist = function() {
    this.blacklistPeers.chain().remove();
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

  this.getMessageIPFS = function(messageIPFS) {
    return this.messages.chain().find({'messageIPFS' : messageIPFS}).data()[0];
  }

  this.checkMessagePastValid = function(lastMessageIPFS, publicKey) {
    return this.messages.chain().find({'$and': [{'lastMessageIPFS':lastMessageIPFS}, {'publicKey':publicKey}]}).data().length > 0;
  }

  this.getCountUnseen = function() {
    var allRatedURLs = this.messages.chain().find({'publicKey':this.publicKey}).data();
    var urlsSeen = [];
    for (i in allRatedURLs) {
      urlsSeen.push(allRatedURLs[i].url);
    }
    console.log("Seen URLs:", urlsSeen);

    var allUnseenURLs = this.messages.chain().find({'url':{'$nin':urlsSeen}}).data();
    var urlsUnSeen = [];
    for (i in allUnseenURLs) {
      if (!urlsUnSeen.includes(allUnseenURLs[i].url)) {
        urlsUnSeen.push(allUnseenURLs[i].url);
      }
    }
    console.log("allUnseenURLs URLs:", urlsUnSeen);
    return urlsUnSeen;

  }

  this.addMessage = function(message) {
    try {
      //check to see if message already exists in DB
      if (this.checkMessageIPFS(message.messageIPFS)) {
        console.log("Message already in DB!", message.messageIPFS);
        return {shouldBlacklist:null, historyPull:null, shouldBroadcast:false};
      }

      //check to see if public key blacklisted
      if (this.checkBlacklistPeer(message.publicKey)) {
        console.log("Peer Blacklisted!", message.publicKey);
        return {shouldBlacklist:null, historyPull:null, shouldBroadcast:false};
      }

      //check to see if multiple messages with same last messageID
      if (this.checkMessagePastValid(message.lastMessageIPFS, message.publicKey)) {
        console.log("Multiple messages with lastMessageIPFS!");
        return {shouldBlacklist:message.publicKey, historyPull:null, shouldBroadcast:false};
      }

      //check to see if public key already rated URL
      if (this.checkIfAlreadyRated(message.publicKey, message.url)) {
        console.log("URL already rated by publicKey!");
        if (message.publicKey != this.publicKey) {
          return {shouldBlacklist:message.publicKey, historyPull:null, shouldBroadcast:false};
        } else {
          return {shouldBlacklist:null, historyPull:null, shouldBroadcast:false};
        }
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

      return {shouldBlacklist:null, historyPull:message.lastMessageIPFS, shouldBroadcast:true};

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

  this.getPeerReputations = function() {
    //get oldest ratings for all ratings = 1 by self
    const notIncludingPublicKey = this.publicKey;
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

  this.getURLRiskScore = function(url) {
    const selfPublicKey = this.publicKey;
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
    if (totalReputation <= MINIMUM_REPUTATION_ASSIGNED_BEFORE_RECOMMENDATIONS) { //ENSURE THAT HAVE OBSERVED ENOUGH PEERS FOR SUFFICIENT REPUTATION
      return 1;
    }

    return 1 - reputationFor/totalReputation;
  }

  this.calculateRecommendations = function(waitingURLs) {

    this.recommendations.chain().remove();

    var applicableRatings = this.messages.chain().data(); //update to restrict via score

    console.log("Calculating New Recommendations on ", applicableRatings.length, " items");

    var recommender = new jsrecommender.Recommender();
    var table = new jsrecommender.Table();

    var {peerReputations, totalReputation} = this.getPeerReputations()

    for (rating in applicableRatings) {
      var thisRating = applicableRatings[rating];
      if (peerReputations[thisRating.publicKey] >= 1 || this.publicKey == thisRating.publicKey) {
        table.setCell(thisRating.url, thisRating.publicKey, thisRating.rating);
      } else {
        // console.log("Don't consider recommendations from:", thisRating.publicKey);
      }

    }

    var model = recommender.fit(table);

    var predicted_table = recommender.transform(table);
    var urls_to_view = [];

    for (var j = 0; j < predicted_table.rowNames.length; ++j) {
      var url_string = predicted_table.rowNames[j];
      if (table.containsCell(url_string, this.publicKey) == false) {
        //check risk score
        var riskScore = this.getURLRiskScore(url_string);
        if(riskScore <= MAX_RISK_TOLERANCE && !waitingURLs.includes(url_string)) {
          urls_to_view.push(url_string);
          this.recommendations.insert({
            url:url_string,
            score:predicted_table.getCell(url_string, this.publicKey)
          });
        } else {
          console.log(url_string, " TOO RISKY TO RECOMMEND!:", riskScore);
        }

      }
    }

    console.log("URLS TO RECOMMEND:", urls_to_view);
  }

  this.getRandomURLFromWikipedia = async function() {
    let promise = new Promise((resolve, reject) => {
      wget("https://en.wikipedia.org/w/api.php?action=query&generator=random&grnnamespace=0&format=json&grnlimit=1", function (error, response, body) {
        var urls = JSON.parse(body)["query"]["pages"];
        var toKeep = [];
        for (var pageID in urls) {
          toKeep.push("https://en.wikipedia.org/wiki?curid=" + pageID);
        }
        resolve(toKeep);
      });
    });

    return (await promise)[0];
  }

  this.getRecommendation = async function(waitingURLs) {
    //update recommendations
    this.calculateRecommendations(waitingURLs);
    var resultSet = this.recommendations.chain().simplesort('score').limit(1);
    var resultSetData = resultSet.data();
    if (resultSetData.length > 0) {
      resultSet.remove()
      return resultSetData[0].url;
    } else {
      var unseenURLs = this.getCountUnseen();
      if (unseenURLs.length > 0 && Math.random() < RANDOM_TRY_URL) {
        return unseenURLs[Math.floor(Math.random() * unseenURLs.length)];
      } else {
        var randWiki = await this.getRandomURLFromWikipedia();
        console.log("RANDOM WIKI ARTICLE:", randWiki);
        return randWiki;
      }
    }
  }
}

module.exports = simpledb;
