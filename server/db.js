// function constructor
const loki = require('lokijs');
const cryptr = require('cryptr');

function db(IPFSNode, conf) {
  this.IPFSNode = IPFSNode;
  this.conf = conf;

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
      this.encryptAndStoreString(dbstring, function(error, ipfs_address) {
        if (error) {
          callback(new Error("An error was encountered loading database."));
        } else {
          console.log("NEW BACKUP IPFS ADDRESS:", ipfs_address);
          conf.set('db', ipfs_address);
          callback(null);
        }
      });
  }

  this.loadDatabase = function(dbname, callback) {
    console.log("CURRENT BACKUP IPFS ADDRESS:", this.conf.get('db'));
    this.getAndDecryptString(this.conf.get('db'), function(error, decryptedFile) {
      if (error) {
        callback(new Error("There was a problem loading the database"));
      } else {
        callback(decryptedFile);
      }
    });
  }

  this.encryptAndStoreString = function(input_string, callback) {
    const encrypter = new cryptr(this.conf.get('privateKey'));
    const encryptedString = encrypter.encrypt(input_string);
    const filesAdded = this.IPFSNode.files.add({
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
      const encrypter = new cryptr(this.conf.get('privateKey'));
      IPFSNode.pin.add(ipfs_address, function(err) {
        if (err) {
          callback(err, "");
        } else {
          IPFSNode.files.cat(ipfs_address, function(err, file) {
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

  this.restoreDatabase = function(callback) {
    if (this.conf.has('db') == false) {
      ratings = this.getCollection('ratings', null);
      whitelist = this.getCollection('whitelist', 'address');
      blacklist = this.getCollection('blacklist', null);
      recommendations = this.getCollection('recommendations', 'address');
      messages = this.getCollection('messages', 'publicKey');
      blacklistPeers = this.getCollection('blacklistPeers', 'publicKey');
      callback(false);
    } else {
      this.lokiDB.loadDatabase({}, () => {
        ratings = this.getCollection('ratings', null);
        whitelist = this.getCollection('whitelist', 'address');
        blacklist = this.getCollection('blacklist', null);
        recommendations = this.getCollection('recommendations', 'address');
        messages = this.getCollection('messages', 'publicKey');
        blacklistPeers = this.getCollection('blacklistPeers', 'publicKey');
        callback(true);
      });
    }

  }

  this.backupDatabase = function() {
    this.lokiDB.saveDatabase();
  }

  this.hello = function() {
    return 'hello!';
  }

  this.goodbye = function() {
    return 'goodbye!';
  }

  this.input = function() {
    return this.inputString;
  }

}

module.exports = db;
