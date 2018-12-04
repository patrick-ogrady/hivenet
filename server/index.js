const IPFS = require('ipfs');
var figlet = require('figlet');
const Configstore = require('configstore');
const pkg = require('./package.json');
const conf = new Configstore(pkg.name);

const express = require('express');
const bodyParser = require("body-parser");
var app = express();
app.use(bodyParser.json());

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




//PUBSUB HANDLING
const recieveMessage = async (msg) => {

};


app.post('/rating', async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

  //need full URL
  if (req.body.url == undefined || req.body.rating == undefined) {
    res.status(422).json();
    return;
  }


  //BACKUP DB


  // const urlFullAddress = removeParams(req.body.url);
  // const urlHostname = extractHostname(req.body.url);
  // const rating = req.body.rating;
  // const {publicKey, privateKey} = await getKeys();
  // if (rating == 0 || rating == 1) {
  //   const successAdding = addToWhitelists(urlFullAddress, urlHostname);
  //   if (successAdding) {
  //     addToRatings(publicKey, urlFullAddress, rating);
  //     runRecommender();
  //   }
  // } else if (rating == -1) {
  //   //blacklist
  //   addToBlacklists(publicKey, urlHostname);
  // } else {
  //   res.status(422).json();
  //   return;
  // }
  //
  // console.log("RATING", urlFullAddress, urlHostname, rating);
  // res.status(200).json();
});

app.post('/risk', function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  if (req.body.url == undefined) {
    res.status(422).json();
    return;
  }

  // const urlFullAddress = removeParams(req.body.url);
  // const urlHostname = extractHostname(req.body.url);
  // if (blacklistHostnames.has(urlHostname)) {
  //   res.status(200).json({status:"blacklist"});
  // } else if (whitelistHostnames.has(urlHostname)){
  //   //score
  //   res.status(200).json({status:"whitelist"});
  // } else {
  //   res.status(200).json({status:"unsure"});
  // }
});

app.get('/recommendations', function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  if (req.body.url == undefined) {
    res.status(422).json();
    return;
  }

  // const urlFullAddress = removeParams(req.body.url);
  // const urlHostname = extractHostname(req.body.url);
  // if (blacklistHostnames.has(urlHostname)) {
  //   res.status(200).json({status:"blacklist"});
  // } else if (whitelistHostnames.has(urlHostname)){
  //   //score
  //   res.status(200).json({status:"whitelist"});
  // } else {
  //   res.status(200).json({status:"unsure"});
  // }
});





//INIT CODE
figlet('HIVENET', function(err, data) {
    if (err) {
        console.log('Something went wrong...');
        console.dir(err);
        return;
    }
    console.log(data, "\n");
    initNet();
});

let node;

async function initNet() {
  //EXPRESS SERVER
  console.log("Loading IPFS Node....")
  node = new IPFS({
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
    app.listen(3000);
    console.log("hivenet API now listening on Port 3000");

    node.pubsub.subscribe(hivenet_ratings, recieveMessage, {discover:true}, (err) => {
      if (err) {
        console.log(`failed to subscribe to ${hivenet_ratings}`, err);
      }
      console.log(`subscribed to ${hivenet_ratings}`);
    })

  });

}
