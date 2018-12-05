const Configstore = require('configstore');
const pkg = require('./package.json');
const conf = new Configstore(pkg.name);
conf.delete('publicKey');
conf.delete('privateKey');
conf.delete('lastMessageIPFS');
conf.delete('backupDB');
