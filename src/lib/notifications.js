(function(){
  var query = queryHash(location.search);
  chrome.extension.sendRequest({
    request: 'notifications',
    content: query['id']
  }, function(data){
  });
})();
