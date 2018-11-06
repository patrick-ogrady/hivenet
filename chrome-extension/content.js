chrome.runtime.sendMessage({
    method: 'POST',
    action: 'xhttp',
    url: 'http://localhost:3000/getScore',
    data: JSON.stringify({url:window.location.href})
}, function(response_obj) {
    if (response_obj.status == 200) {
      var obj = JSON.parse(response_obj.responseText);
      if (obj.status == "blacklist") {
        alert("WARNING!!! THIS WEBSITE IS ON YOUR BLACKLIST!!!");
      } else{
        if (obj.status == "unsure") {
          alert("WARNING!!! THIS WEBSITE COULD BE MALICIOUS (INSERT SCORE)!!!");
        } else {
          alert("already on whitelist")
        }
        chrome.runtime.sendMessage({
            method: 'POST',
            action: 'xhttp',
            url: 'http://localhost:3000/addWhitelist',
            data: JSON.stringify({url:window.location.href})
        }, function(response_obj) {
          console.log(response_obj);
        });
      }

    }
    /*Callback function to deal with the response*/
});
