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
  restoreDatabase(function(success) {
    if (success == false) {
      console.log("PREVIOUS DB SAVE NOT PRESENT");
      addRatingToDB("1", "url1", "hostname1", 1)
      addRatingToDB("1", "url2", "hostname1", 1)
      addRatingToDB("1", "url3", "hostname2", 1)
      addRatingToDB("1", "url4", "hostname3", 1)
      addRatingToDB("2", "url2", "hostname1", 1)
      addRatingToDB("2", "url5", "hostname2", 1)
      addRatingToDB("2", "url3", "hostname2", 0)
      console.log(ratings.data);

      // deleteForHostname("hostname1");

      // console.log("Post-delete:", ratings.data);

      // deleteForPublicKey("2");

      //console.log("Post-delete:", ratings.data);

      addWhitelist("address1", "hostname1");
      addWhitelist("address1", "hostname1");
      addWhitelist("address3", "hostname2");

      backupDatabase();
    } else {
      console.log("PREVIOUS DB SAVE PRESENT");
    }

    calculateRecommendations("2");
    console.log("Next Recommendation:", getRecommendation());
    console.log("Next Recommendation:", getRecommendation());
    console.log("Next Recommendation:", getRecommendation());
    console.log("Next Recommendation:", getRecommendation());
    backupDatabase();
  });




});

let ratings;
let whitelist;
let blacklist;
let recommendations;

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
  if (conf.has('db')) {
    db.loadDatabase({}, function() {
      ratings = getCollection('ratings', null);
      whitelist = getCollection('whitelist', 'address');
      blacklist = getCollection('blacklist', null);
      recommendations = getCollection('recommendations', 'address');
      callback(true);
    });
  } else {
    ratings = getCollection('ratings', null);
    whitelist = getCollection('whitelist', 'address');
    blacklist = getCollection('blacklist', null);
    recommendations = getCollection('recommendations', 'address');
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



function addRatingToDB(publicKey, address, hostname, rating) {
  ratings.insert({
    publicKey:publicKey,
    address:address,
    hostname:hostname,
    rating:rating
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
