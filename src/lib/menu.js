var Menus = MochiKit.Base.update(new Repository(), {
  separators : 0,

  _register : function(createProperties, parent, target, after) {
    var name = '';

    if (createProperties.type === 'separator') {
      name = 'separator_' + (++this.separators);
    }
    else {
      name = createProperties.title;
    }

    this.register({
      name       : name,
      parent     : parent,
      properties : createProperties
    }, target, after);

    return this[name];
  },

  top_menu : null,
  creating : false,

  create : function(topMenuProperties) {
    var self = this;

    if (topMenuProperties) {
      this.top_menu = topMenuProperties;
    }
    if (this.creating || !this.top_menu) {
      callLater(0.5, Menus.create);
      return;
    }
    this.creating = true;

    chrome.contextMenus.removeAll(function() {
      if (self.top_menu.generatedId) {
        delete self.top_menu.generatedId;
      }
      var top_menu_id = chrome.contextMenus.create(self.top_menu);

      self.values.forEach(function(menu) {
        if (menu.parent && self[menu.parent]) {
          menu.properties.parentId = self[menu.parent].id || top_menu_id;
        }
        else {
          menu.properties.parentId = top_menu_id;
        }
        if (menu.properties.generatedId) {
          delete menu.properties.generatedId;
        }
        self[menu.name].id = chrome.contextMenus.create(menu.properties);
      });

      self.creating = false;
    });
  }
});

(function() {
  Menus._register({
    title: 'Taberareloo',
    contexts: ['all'],
    onclick: function(info, tab) {
      chrome.tabs.sendMessage(tab.id, {
        request: 'contextMenus',
        content: info
      });
    }
  });
  Menus._register({
    title: 'Quote',
    contexts: ['selection'],
    onclick: function(info, tab) {
      chrome.tabs.sendMessage(tab.id, {
        request: 'contextMenusQuote',
        content: info
      });
    }
  });
  Menus._register({
    title: 'Link',
    contexts: ['link'],
    onclick: function(info, tab) {
      chrome.tabs.sendMessage(tab.id, {
        request: 'contextMenusLink',
        content: info
      });
    }
  });
  Menus._register({
    title: 'Photo',
    contexts: ['image'],
    onclick: function(info, tab) {
      chrome.tabs.sendMessage(tab.id, {
        request: 'contextMenusImage',
        content: info
      });
    }
  });
  Menus._register({
    title: 'Photo - Upload from Cache',
    contexts: ['image'],
    onclick: function(info, tab) {
      chrome.tabs.sendMessage(tab.id, {
        request: 'contextMenusImageCache',
        content: info
      });
    }
  });
  Menus._register({
    title: 'Video',
    contexts: ['video'],
    onclick: function(info, tab) {
      chrome.tabs.sendMessage(tab.id, {
        request: 'contextMenusVideo',
        content: info
      });
    }
  });
  Menus._register({
    title: 'Audio',
    contexts: ['audio'],
    onclick: function(info, tab) {
      chrome.tabs.sendMessage(tab.id, {
        request: 'contextMenusAudio',
        content: info
      });
    }
  });
  Menus._register({
    title: 'Photo - Flickr',
    contexts: ['all'],
    documentUrlPatterns: ['http://www.flickr.com/photos/*/*/*'],
    onclick: function(info, tab) {
      chrome.tabs.sendMessage(tab.id, {
        request: 'contextMenusImage',
        content: info
      });
    }
  });
  Menus._register({
    title: 'Photo - Capture',
    contexts: ['all'],
    onclick: function(info, tab) {
      chrome.tabs.sendMessage(tab.id, {
        request: 'contextMenusCapture',
        content: info
      });
    }
  });
  Menus._register({
    title: 'Photo - Search - GoogleImage',
    contexts: ['image'],
    onclick: function(info, tab) {
      chrome.tabs.sendMessage(tab.id, {
        request: 'contextMenusSearchGoogleImage',
        content: info
      });
    }
  });
  Menus._register({
    title: 'Photo - Background Image',
    contexts: ['all'],
    onclick: function(info, tab) {
      chrome.tabs.sendMessage(tab.id, {
        request: 'contextMenusBGImage',
        content: info
      });
    }
  });
  Menus._register({
    title: 'Text',
    contexts: ['all'],
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
  Menus._register({
    type: 'separator',
    contexts: ['all'],
    documentUrlPatterns: googlePlusCommunitiesURLs
  });
  Menus._register({
    title: 'Google+ Community ...',
    contexts: ['all'],
    documentUrlPatterns: googlePlusCommunitiesURLs
  });
  Menus._register({
    title: 'Add to destinations',
    contexts: ['all'],
    documentUrlPatterns: googlePlusCommunitiesURLs,
    onclick: function(info, tab) {
      chrome.tabs.sendMessage(tab.id, {
        request: 'contextMenusAddGooglePlusCommunityCategory',
        content: info
      });
    }
  }, 'Google+ Community ...');
  Menus._register({
    title: 'Remove from destinations',
    contexts: ['all'],
    documentUrlPatterns: googlePlusCommunitiesURLs,
    onclick: function(info, tab) {
      chrome.tabs.sendMessage(tab.id, {
        request: 'contextMenusRemoveGooglePlusCommunityCategory',
        content: info
      });
    }
  }, 'Google+ Community ...');
  var patchFileURLs = [
    'http://*/*.tbrl.js',
    'https://*/*.tbrl.js'
  ];
  Menus._register({
    type: 'separator',
    contexts: ['page'],
    documentUrlPatterns: patchFileURLs
  });
  Menus._register({
    title: 'Patch - Install this',
    contexts: ['page'],
    documentUrlPatterns: patchFileURLs,
    onclick: function(info, tab) {
      Patches.install(info.pageUrl).addCallback(function(res) {
        if (res) {
          window.location.reload();
        }
      });
    }
  });
})();

Menus.create({
  title: 'Share ...',
  contexts: ['all']
});
