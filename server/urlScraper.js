var wget = require('node-wget');
var fs = require('fs');



async function getRandomURLs() {
  let promise = new Promise((resolve, reject) => {
    wget("https://en.wikipedia.org/w/api.php?action=query&generator=random&grnnamespace=0&format=json&grnlimit=30", function (error, response, body) {
      var urls = JSON.parse(body)["query"]["pages"];
      var toKeep = [];
      for (var pageID in urls) {
        toKeep.push("https://en.wikipedia.org/wiki?curid=" + pageID);
      }
      resolve(toKeep);
    });
  });

  return await promise;

}

async function collectURLs() {
  var totalURLs = [];
  while (totalURLs.length < 150) {
    totalURLs = totalURLs.concat(await getRandomURLs());
    console.log(totalURLs.length);
  }
  fs.writeFile("wiki.txt", JSON.stringify(totalURLs), function(err) {
      if (err) {
          console.log(err);
      }
  });
}

collectURLs();
