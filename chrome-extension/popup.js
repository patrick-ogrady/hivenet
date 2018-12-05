

// Once the DOM is ready...
window.addEventListener('DOMContentLoaded', function () {
  // // ...query for the active tab...
  document.getElementById('getRecommendation').addEventListener('click', function() {
    chrome.runtime.sendMessage({
        method: 'GET',
        action: 'xhttp',
        url: 'http://localhost:3000/recommendation',
        data: ''
    }, function(response_obj) {
      if (response_obj.status == 404) {
        alert("No recommendations remaining");
      } else {
        if (response_obj.status != 200) {
          alert("Connection error. Make sure you started the command line app!");
        } else {
          var obj = JSON.parse(response_obj.responseText);

          chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
              var tab = tabs[0];
              chrome.tabs.update(tab.id, {url: obj.url});
              window.close();
          });
        }


      }


        /*Callback function to deal with the response*/
    });
  });

  document.getElementById('rateBad').addEventListener('click', function() {
    chrome.tabs.query({
      active: true,
      lastFocusedWindow: true
    }, function(tabs) {
        // and use that tab to fill in out title and url
        var tab = tabs[0];
        chrome.runtime.sendMessage({
            method: 'POST',
            action: 'xhttp',
            url: 'http://localhost:3000/rating',
            data: JSON.stringify({url:tab.url, rating:0})
        }, function(response_obj) {
            if (response_obj.status == 422) {
              alert("Already saved rating for:" + tab.url);
            } else {
              if (response_obj.status != 200) {
                alert("Connection error. Make sure you started the command line app!");
              }
            }
            window.close();

            /*Callback function to deal with the response*/
        });
    });
  });

  document.getElementById('rateGood').addEventListener('click', function() {
    chrome.tabs.query({
      active: true,
      lastFocusedWindow: true
    }, function(tabs) {
        // and use that tab to fill in out title and url
        var tab = tabs[0];
        chrome.runtime.sendMessage({
            method: 'POST',
            action: 'xhttp',
            url: 'http://localhost:3000/rating',
            data: JSON.stringify({url:tab.url, rating:1})
        }, function(response_obj) {
            if (response_obj.status == 422) {
              alert("Already saved rating for:" + tab.url);
            } else {
              if (response_obj.status != 200) {
                alert("Connection error. Make sure you started the command line app!");
              }
            }
            window.close();



            /*Callback function to deal with the response*/
        });
    });
  });


});
