var fs = require("fs");
const FILE_PATH = ".";
const publicKeyFile = "publicKey.txt";
const privateKeyFile = "privateKey.txt";
const lastMessageIPFSFile = "lastMessageIPFS.txt";
const dbBackupFile = "dbBackupFile.txt";

async function getFile(fileName) {
  let promise = new Promise((resolve, reject) => {
    fs.readFile(FILE_PATH + "/" + fileName, function(err, data) {
      if (err) {
        console.log(err);
        resolve(null);
      } else {
        resolve(data.toString());
      }
    })
  });
  return await promise;
}

async function saveFile(fileName, fileContent) {
  let promise = new Promise((resolve, reject) => {
    fs.writeFile(FILE_PATH + "/" + fileName, new Buffer.from(fileContent), function (err) {
      if (err) {
        console.log(err);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
  return await promise;
}


async function runTests() {
  await saveFile(publicKeyFile, "hello");
  console.log(await getFile(publicKeyFile));
}

runTests();
