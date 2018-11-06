const jsrecommender = require("./jsrecommender");
var recommender = new jsrecommender.Recommender();

const IPFS = require('ipfs');
const cryptr = require('cryptr');
const randomkey = require('random-key');

const crypto2 = require('crypto2');

var figlet = require('figlet');
const Configstore = require('configstore');
const pkg = require('./package.json');
const conf = new Configstore(pkg.name);

figlet('HIVENET', function(err, data) {
    if (err) {
        console.log('Something went wrong...');
        console.dir(err);
        return;
    }
    console.log(data);
    start();
});


async function start() {

  if (conf.has('publicKey') == false) {
    console.log("CREATING KEY PAIRS");
    const { privateKey, publicKey } = await crypto2.createKeyPair();
    conf.set('publicKey', publicKey);
    conf.set('privateKey', privateKey);
    console.log("Public Key:", publicKey, "\n");
  } else {
    console.log("KEY PAIRS ALREADY EXIST");
  }

  const publicKey = conf.get('publicKey');
  const privateKey = conf.get('privateKey');


  const input_string = 'the native web';

  const input_hash = await crypto2.hash.sha256(input_string);
  console.log("input hash:", input_hash, "\n");

  const signature = await crypto2.sign.sha256(input_hash, privateKey);
  console.log("signature:", signature, "\n");

  const isSignatureValid = await crypto2.verify.sha256(input_hash, publicKey, signature);
  console.log("signature valid:", isSignatureValid, "\n");

}
