(function() {
  var id = chrome.contextMenus.create({
    title: 'Share ...',
    contexts: ['all']
  });
  chrome.contextMenus.create({
    title: 'Taberareloo',
    contexts: ['all'],
    parentId: id,
    onclick: function(info, tab) {
      chrome.tabs.sendMessage(tab.id, {
        request: 'contextMenus',
        content: info
      });
    }
  });
  chrome.contextMenus.create({
    title: 'Quote',
    contexts: ['selection'],
    parentId: id,
    onclick: function(info, tab) {
      chrome.tabs.sendMessage(tab.id, {
        request: 'contextMenusQuote',
        content: info
      });
    }
  });
  chrome.contextMenus.create({
    title: 'Link',
    contexts: ['link'],
    parentId: id,
    onclick: function(info, tab) {
      chrome.tabs.sendMessage(tab.id, {
        request: 'contextMenusLink',
        content: info
      });
    }
  });
  chrome.contextMenus.create({
    title: 'Photo',
    contexts: ['image'],
    parentId: id,
    onclick: function(info, tab) {
      chrome.tabs.sendMessage(tab.id, {
        request: 'contextMenusImage',
        content: info
      });
    }
  });
  chrome.contextMenus.create({
    title: 'Photo - Upload from Cache',
    contexts: ['image'],
    parentId: id,
    onclick: function(info, tab) {
      chrome.tabs.sendMessage(tab.id, {
        request: 'contextMenusImageCache',
        content: info
      });
    }
  });
  chrome.contextMenus.create({
    title: 'Video',
    contexts: ['video'],
    parentId: id,
    onclick: function(info, tab) {
      chrome.tabs.sendMessage(tab.id, {
        request: 'contextMenusVideo',
        content: info
      });
    }
  });
  chrome.contextMenus.create({
    title: 'Audio',
    contexts: ['audio'],
    parentId: id,
    onclick: function(info, tab) {
      chrome.tabs.sendMessage(tab.id, {
        request: 'contextMenusAudio',
        content: info
      });
    }
  });
  chrome.contextMenus.create({
    title: 'Photo - Flickr',
    contexts: ['all'],
    parentId: id,
    documentUrlPatterns: ['http://www.flickr.com/photos/*/*/*'],
    onclick: function(info, tab) {
      chrome.tabs.sendMessage(tab.id, {
        request: 'contextMenusImage',
        content: info
      });
    }
  });
  chrome.contextMenus.create({
    title: 'Photo - Capture',
    contexts: ['all'],
    parentId: id,
    onclick: function(info, tab) {
      chrome.tabs.sendMessage(tab.id, {
        request: 'contextMenusCapture',
        content: info
      });
    }
  });
  chrome.contextMenus.create({
    title: 'Photo - Search - GoogleImage',
    contexts: ['image'],
    parentId: id,
    onclick: function(info, tab) {
      chrome.tabs.sendMessage(tab.id, {
        request: 'contextMenusSearchGoogleImage',
        content: info
      });
    }
  });
  chrome.contextMenus.create({
    title: 'Photo - Background Image',
    contexts: ['all'],
    parentId: id,
    onclick: function(info, tab) {
      chrome.tabs.sendMessage(tab.id, {
        request: 'contextMenusBGImage',
        content: info
      });
    }
  });
  chrome.contextMenus.create({
    title: 'Text',
    contexts: ['all'],
    parentId: id,
    onclick: function(info, tab) {
      chrome.tabs.sendMessage(tab.id, {
        request: 'contextMenusText',
        content: info
      });
    }
  });
})();
