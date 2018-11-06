const loki = require('lokijs');
const Configstore = require('configstore');
const pkg = require('./package.json');
const conf = new Configstore(pkg.name);

const jsrecommender = require("./jsrecommender");
var recommender = new jsrecommender.Recommender();

var db = new loki('sandbox', {
  adapter: {
    mode:"reference",
    saveDatabase: function(dbname, dbstring, callback) {
      // store the database, for this example to localstorage
      console.log(dbstring);
      conf.set('db', dbstring);

      var success = true;  // make your own determinations
      if (success) {
        callback(null);
      }
      else {
        callback(new Error("An error was encountered loading " + dbname + " database."));
      }
    },
    loadDatabase: function(dbname, callback) {
      // using dbname, load the database from wherever your adapter expects it


      var success = true; // make your own determinations

      if (success) {
        callback(conf.get('db'));
      }
      else {
        callback(new Error("There was a problem loading the database"));
      }
    }
  }
});

var ratings = db.addCollection('ratings');
var whitelist = db.addCollection('whitelist', {
  unique:['address']
});
var blacklist = db.addCollection('blacklist');



//
// if (conf.has('db')) {
//   console.log("DB EXISTS");
//   db.loadDatabase();
//   var items = db.addCollection('items');
//   console.log(items.data);
// } else {
//   console.log("DB DOES NOT EXIST");
//   // Add a collection to the database
//   var items = db.addCollection('items');
//
//   // Add some documents to the collection
//   items.insert({ name : 'mjolnir', owner: 'thor', maker: 'dwarves' });
//   items.insert({ name : 'gungnir', owner: 'odin', maker: 'elves' });
//   items.insert({ name : 'tyrfing', owner: 'Svafrlami', maker: 'dwarves' });
//   items.insert({ name : 'draupnir', owner: 'odin', maker: 'elves' });
//   items.chain().find({ 'owner': 'odin' }).remove();
//   console.log(items.data);
//   db.saveDatabase();
// }

function addRatingToDB(publicKey, address, hostname, rating) {
  ratings.insert({
    publicKey:publicKey,
    address:address,
    hostname:hostname,
    rating:rating
  });
}

addRatingToDB("1", "url1", "hostname1", 1)
addRatingToDB("1", "url2", "hostname1", 1)
addRatingToDB("1", "url3", "hostname2", 1)
addRatingToDB("1", "url4", "hostname3", 1)
addRatingToDB("2", "url2", "hostname1", 1)
addRatingToDB("2", "url5", "hostname2", 1)
addRatingToDB("2", "url3", "hostname2", 0)
console.log(ratings.data);


function deleteForHostname(hostname) {
  ratings.chain().find({ 'hostname': hostname }).remove();
}

// deleteForHostname("hostname1");

// console.log("Post-delete:", ratings.data);

function deleteForPublicKey(publicKey) {
  ratings.chain().find({ 'publicKey': publicKey }).remove();
}

// deleteForPublicKey("2")

console.log("Post-delete:", ratings.data);

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

addWhitelist("address1", "hostname1");
addWhitelist("address1", "hostname1");
addWhitelist("address3", "hostname2");

function getRatingsForHostnames(hostnames) {
  return ratings.find({ 'hostname' : { '$in' : hostnames } })
}

function calculateRecommendations(publicKey) {
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
      urls_to_view.push([url_string, predicted_table.getCell(url_string, publicKey)]);
    }
  }

  return urls_to_view.sort(function(a,b) {
    return a[1] < b[1] ? 1:0;
  });
}

console.log(calculateRecommendations("2"));
