// function constructor
const loki = require('lokijs');
const cryptr = require('cryptr');

function db(IPFSNode, conf) {
  this.IPFSNode = IPFSNode;
  this.conf = conf;

  //DB COLLECTIONS
  this.messages = null;
  this.blacklistPeers = null;
  this.whitelist = null;

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
      const encrypter = new cryptr(this.conf.get('privateKey'));
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
  this.restoreDatabase = async function(callback) { //must run before starting

    let promise = new Promise((resolve, reject) => {
      if (this.conf.has('db') == true) {
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
    this.whitelist = this.getCollection('whitelist', 'address');

    return dbExists;

  }

  this.backupDatabase = async function(callback) {
    let promise = new Promise((resolve, reject) => {
      this.lokiDB.saveDatabase(() => {
        resolve();
      });
    });

  }


  //TODO: SERIAL EVENT PROCESSING: https://stackoverflow.com/questions/39044183/serially-processing-a-queue-of-messages-whose-processing-is-async
  this.inProcess = false;
  this.messageQueue = [];

  //message passed in should already be parsed...just adding
  this.processMessageQueue = function(message, historicalMessage) {
    //historical message is a boolean indicating if older message
    if (!this.inProcess) {
      console.log("Nothing in process!");
      this.processMessage(message, historicalMessage);
    } else {
      console.log("Message in Queue:", this.messageQueue.length);
      this.messageQueue.push([message, historicalMessage]);
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

  this.processMessage = function(message, historicalMessage) { //input message should not be a IPFS address (otherwise would have to poll IPFS for every incoming message)
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

    //check if creationTime is within Y seconds of recievedTime (unless processing a chain)
      //drop message

    //check if publicKey in blacklistPeers
      //drop message

    //check if messageIPFS already stored in messages
      //drop message

    //check if messageIndex for publicKey already stored
      //blacklist -> personal fork detected

    //check if message history now means that two messages were proof marked
    //less than X seconds apart
      //blacklist -> attack detected

    //addToDB

    //Broadcast (unless processing a chain...would get dropped by other clients because old message)



    //mirror processing
    setTimeout(() => {
      console.log(message);
      //code to be executed after 10 second
      // see if anything else is in the queue to process
      this.endProcessMessage();

    }, 1000 * 3);

    //mark complete


  }

}

module.exports = db;
