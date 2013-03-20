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
  var googlePlusCommunitiesURLs = [
    'https://plus.google.com/communities/*',
    'https://plus.google.com/u/0/communities/*'
  ];
  chrome.contextMenus.create({
    type: 'separator',
    contexts: ['all'],
    parentId: id,
    documentUrlPatterns: googlePlusCommunitiesURLs
  });
  var sub_id = chrome.contextMenus.create({
    title: 'Google+ Community ...',
    contexts: ['all'],
    parentId: id,
    documentUrlPatterns: googlePlusCommunitiesURLs
  });
  chrome.contextMenus.create({
    title: 'Add to destinations',
    contexts: ['all'],
    parentId: sub_id,
    documentUrlPatterns: googlePlusCommunitiesURLs,
    onclick: function(info, tab) {
      chrome.tabs.sendMessage(tab.id, {
        request: 'contextMenusAddGooglePlusCommunityCategory',
        content: info
      });
    }
  });
  chrome.contextMenus.create({
    title: 'Remove from destinations',
    contexts: ['all'],
    parentId: sub_id,
    documentUrlPatterns: googlePlusCommunitiesURLs,
    onclick: function(info, tab) {
      chrome.tabs.sendMessage(tab.id, {
        request: 'contextMenusRemoveGooglePlusCommunityCategory',
        content: info
      });
    }
  });
  var patchFileURLs = [
    'http://*/*.js',
    'https://*/*.js'
  ];
  chrome.contextMenus.create({
    type: 'separator',
    contexts: ['all'],
    parentId: id
  });
  var patch_sub_id = chrome.contextMenus.create({
    title: 'Patch ...',
    contexts: ['all'],
    parentId: id
  });
  chrome.contextMenus.create({
    title: 'Install this',
    contexts: ['page'],
    parentId: patch_sub_id,
    documentUrlPatterns: patchFileURLs,
    onclick: function(info, tab) {
      Patch.install(info.pageUrl);
    }
  });
  chrome.contextMenus.create({
    title: 'Uninstall this',
    contexts: ['page'],
    parentId: patch_sub_id,
    documentUrlPatterns: patchFileURLs,
    onclick: function(info, tab) {
      Patch.uninstall(info.pageUrl);
    }
  });
  chrome.contextMenus.create({
    title: 'List',
    contexts: ['all'],
    parentId: patch_sub_id,
    onclick: function(info, tab) {
      Patch.list();
    }
  });
  chrome.contextMenus.create({
    title: 'Remove all',
    contexts: ['all'],
    parentId: patch_sub_id,
    onclick: function(info, tab) {
      Patch.removeAll();
    }
  });
})();
