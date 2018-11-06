const loki = require('lokijs');
const Configstore = require('configstore');
const pkg = require('./package.json');
const conf = new Configstore(pkg.name);

const jsrecommender = require("./jsrecommender");
var recommender = new jsrecommender.Recommender();

const IPFS = require('ipfs');
const cryptr = require('cryptr');

const crypto2 = require('crypto2');

async function getKeys() {
  if (conf.has('publicKey') == false) {
    console.log("CREATING KEY PAIRS");
    const { privateKey, publicKey } = await crypto2.createKeyPair();
    conf.set('publicKey', publicKey);
    conf.set('privateKey', privateKey);
    console.log("Public Key:", publicKey, "\n");
  } else {
    console.log("KEY PAIRS ALREADY EXIST");
  }

  return {publicKey:conf.get('publicKey'), privateKey:conf.get('privateKey')};
}

async function encryptAndStoreString(input_string, callback) {
  const {publicKey, privateKey} = await getKeys();
  const encrypter = new cryptr(privateKey);
  const encryptedString = encrypter.encrypt(input_string);
  const filesAdded = node.files.add({
    content: Buffer.from(encryptedString)
  }, function(err, res) {
    if (err) {
      callback(err, "");
    } else {
      callback("", res[0].hash);
    }

  })
}

async function getAndDecryptString(ipfs_address, callback) {
  try {
    const {publicKey, privateKey} = await getKeys();
    const encrypter = new cryptr(privateKey);
    node.pin.add(ipfs_address, function(err) {
      if (err) {
        callback(err, "");
      } else {
        node.files.cat(ipfs_address, function(err, file) {
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


var db = new loki('sandbox', {
  adapter: {
    mode:"reference",
    saveDatabase: async function(dbname, dbstring, callback) {
      encryptAndStoreString(dbstring, function(error, ipfs_address) {
        if (error) {
          callback(new Error("An error was encountered loading database."));
        } else {
          console.log("BACKUP IPFS ADDRESS:", ipfs_address);
          conf.set('db', ipfs_address);
          callback(null);
        }

      });
    },
    loadDatabase: async function(dbname, callback) {
      // TODO: LOAD AND DECRYPT FROM IPFS
      getAndDecryptString(conf.get('db'), function(error, decryptedFile) {
        if (error) {
          callback(new Error("There was a problem loading the database"));
        } else {
          callback(decryptedFile);
        }
      });
    }
  }
});

console.log("Loading IPFS Node....")
const node = new IPFS({
  EXPERIMENTAL:{ pubsub: true},
  relay:{enabled:true, hop:{enabled:true}},
  config: {
    Addresses: {
      Swarm: [
        "/dns4/ws-star.discovery.libp2p.io/tcp/443/wss/p2p-websocket-star"
      ]
    }
  }
});

node.on('ready', async () => { //wait to run command line until IPFS initialized
  conf.delete('db');
  restoreDatabase(function(success) {
    if (success == false) {
      console.log("PREVIOUS DB SAVE NOT PRESENT");
      addRatingToDB("1", "url1", "hostname1", 1, "2018-11-06T00:53:40Z")
      addRatingToDB("1", "url2", "hostname1", 1, "2018-11-06T00:53:40Z")
      addRatingToDB("1", "url3", "hostname2", 1, "2018-11-06T00:53:40Z")
      addRatingToDB("1", "url4", "hostname3", 1, "2018-11-06T00:53:40Z")
      addRatingToDB("1", "url9", "hostname9", 1, "2018-11-06T00:53:40Z")
      addRatingToDB("2", "url2", "hostname1", 1, "2018-11-05T00:53:40Z")
      addRatingToDB("2", "url5", "hostname2", 1, "2018-11-07T00:53:40Z")
      addRatingToDB("2", "url3", "hostname2", 0, "2018-11-07T00:53:40Z")
      addRatingToDB("3", "url9", "hostname9", 1, "2018-11-05T00:53:40Z")
      addRatingToDB("3", "url1", "hostname1", 1, "2018-11-05T00:53:40Z")
      console.log(ratings.data);

      // deleteForHostname("hostname1");

      // console.log("Post-delete:", ratings.data);

      // deleteForPublicKey("2");

      //console.log("Post-delete:", ratings.data);

      addWhitelist("address1", "hostname1");
      addWhitelist("address1", "hostname1");
      addWhitelist("address3", "hostname2");

      // backupDatabase();
    } else {
      console.log("PREVIOUS DB SAVE PRESENT");
    }

    calculateRecommendations("2");
    console.log("Next Recommendation:", getRecommendation());
    console.log("Next Recommendation:", getRecommendation());
    console.log("Next Recommendation:", getRecommendation());
    console.log("Next Recommendation:", getRecommendation());
    // backupDatabase();

    console.log("oldest:", "url2", getOldestSeen("url2"));
    console.log("oldest:", "url6", getOldestSeen("url6"));

    userCounts = getUserCountOldestRatedAddresses("1");
    console.log("userCounts:", userCounts);

    addBlacklist("2", "hostname8", "2018-11-07T00:53:40Z");
    addBlacklist("3", "hostname8", "2018-11-07T00:54:40Z");
    console.log("Site Risk:", "hostname8", getNewAddressRisk("1", "hostname8"));

    addBlacklist("3", "hostname10", "2018-11-07T00:53:40Z");

    console.log("Site Risk:", "hostname10", getNewAddressRisk("1", "hostname10"));


    var handle1 = handleNewMessage("2", (new Date()).toISOString());
    var handle2 = handleNewMessage("2", (new Date()).toISOString());
    console.log("SLEEPING...");
    sleep(30).then(() => {
      //do stuff
      var handle3 = handleNewMessage("2", (new Date()).toISOString());
      var handle4 = handleNewMessage("2", (new Date()).toISOString());
      console.log("Message Handling Results:", handle1, handle2, handle3, handle4);
    })

  });

});

const sleep = (seconds) => {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000))
}

let ratings;
let whitelist;
let blacklist;
let recommendations;
let messages;

function getCollection(collectionName, uniqueCol) {
  var toReturn = db.getCollection(collectionName);
  if (!toReturn) {
    console.log("Must Create", collectionName, uniqueCol);
    if (uniqueCol) {
      return db.addCollection(collectionName, {
        unique:[uniqueCol]
      });
    } else {
      return db.addCollection(collectionName);
    }
  } else {
    return toReturn;
  }
}


function restoreDatabase(callback) {
  //TODO: originalUrls, blacklist peers, blacklistedItemsForPublicKey, mostRecentMessageTime


  if (conf.has('db')) {
    db.loadDatabase({}, function() {
      ratings = getCollection('ratings', null);
      whitelist = getCollection('whitelist', 'address');
      blacklist = getCollection('blacklist', null);
      recommendations = getCollection('recommendations', 'address');
      messages = getCollection('messages', 'publicKey');
      callback(true);
    });
  } else {
    ratings = getCollection('ratings', null);
    whitelist = getCollection('whitelist', 'address');
    blacklist = getCollection('blacklist', null);
    recommendations = getCollection('recommendations', 'address');
    messages = getCollection('messages', 'publicKey');
    callback(false);
  }
}


function backupDatabase() {
  if (conf.has('db')) {
    console.log("Old IPFS:", conf.get('db'));
  }
  db.saveDatabase();
  console.log("New IPFS:", conf.get('db'));
}



function addRatingToDB(publicKey, address, hostname, rating, proofTimestamp) {
  ratings.insert({
    publicKey:publicKey,
    address:address,
    hostname:hostname,
    rating:rating,
    proofTimestamp:proofTimestamp
  });
}

function deleteForHostname(hostname) {
  ratings.chain().find({ 'hostname': hostname }).remove();
}


function deleteForPublicKey(publicKey) {
  ratings.chain().find({ 'publicKey': publicKey }).remove();
}


function addWhitelist(address, hostname) { //added unique specifier
  try {
    whitelist.insert({
      address:address,
      hostname:hostname
    });
  } catch (error) {
    console.log("Can't add to whitelist!", error);
  }
}

function getUniqueWhitelistHostnames() {
  var result = whitelist.mapReduce(function(obj) {
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



function getRatingsForHostnames(hostnames) {
  return ratings.find({ 'hostname' : { '$in' : hostnames } })
}

function calculateRecommendations(publicKey) {
  recommendations.chain().remove()
  var allUniqueHostnames = getUniqueWhitelistHostnames();

  var applicableRatings = getRatingsForHostnames(allUniqueHostnames);

  table = new jsrecommender.Table();

  for (rating in applicableRatings) {
    var thisRating = applicableRatings[rating];
    table.setCell(thisRating.address, thisRating.publicKey, thisRating.rating);
  }

  var model = recommender.fit(table);

  var predicted_table = recommender.transform(table);
  var urls_to_view = [];

  for (var j = 0; j < predicted_table.rowNames.length; ++j) {
    var url_string = predicted_table.rowNames[j];
    if (table.containsCell(url_string, publicKey) == false) {
      recommendations.insert({
        address:url_string,
        score:predicted_table.getCell(url_string, publicKey)
      });
    }
  }
}

function getRecommendation() {
  var resultSet = recommendations.chain().simplesort('score').limit(1);
  var resultSetData = resultSet.data();
  if (resultSetData.length > 0) {
    resultSet.remove()
    return resultSetData[0];
  } else {
    return null;
  }
}

function getOldestSeen(address) {
  var resultSetData = ratings.chain().find({'address':address}).simplesort('proofTimestamp').limit(1).data();
  if (resultSetData.length > 0) {
    return resultSetData[0];
  } else {
    return null;
  }
}

function getUserCountOldestRatedAddresses(publicKey) {
  //get oldest ratings for all ratings = 1 by self
  var allPublicKeyRatings = ratings.chain().find({'publicKey':publicKey}).data();
  var allCount = {};
  for (rating in allPublicKeyRatings) {
    var oldestSeenRating = getOldestSeen(allPublicKeyRatings[rating].address);
    console.log(oldestSeenRating.publicKey, oldestSeenRating.address, oldestSeenRating.proofTimestamp);
    if (oldestSeenRating.publicKey == publicKey) {
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

function addBlacklist(publicKey, hostname, proofTimestamp) {
  //TODO: Need to consider the case where person adding to blacklist is self...need to also blacklistPeers and remove

  blacklist.insert({
    hostname:hostname,
    publicKey:publicKey,
    proofTimestamp:proofTimestamp
  });
}

function getNewAddressRisk(publicKey, hostname) { //returns risk out of 1
  //get oldest ratings for all ratings = 1 by self
  const userCounts = getUserCountOldestRatedAddresses(publicKey);
  var totalPoints = 0;
  var totalScore = 0;
  for (userPublicKey in userCounts) {
    var result = blacklist.chain().find({'$and': [{'publicKey' : userPublicKey},{'hostname' : hostname}]}).data()
    if (result.length > 0) {
      totalScore += userCounts[userPublicKey];
    }
    totalPoints += userCounts[userPublicKey];
  }

  return totalScore/totalPoints;
}

function handleNewMessage(publicKey, proofTimestamp) {
  var results = messages.chain().find({'publicKey':publicKey}).limit(1).data();
  var currentDate = new Date();
  if (results.length > 0) {
    var doc = results[0];
    var timeSinceProof = (currentDate - new Date(proofTimestamp))/1000;
    var timeSinceLastMessage = (currentDate - new Date(doc.proofTimestamp))/1000;
    console.log("Time since proof:", timeSinceProof);
    console.log("Time since last message:", timeSinceLastMessage);
    if (timeSinceProof < 70 && timeSinceLastMessage > 30) {
      doc.proofTimestamp = proofTimestamp;
      messages.update(doc);
      return true;
    } else {
      return false;
    }
  } else {
    messages.insert({
      publicKey:publicKey,
      proofTimestamp:currentDate.toISOString()
    });
    return true;
  }
}
