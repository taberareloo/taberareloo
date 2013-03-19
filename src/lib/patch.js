// -*- coding: utf-8 -*-

var Patches = MochiKit.Base.update(new Repository(), {
  dirEntry : null,

  initailize : function() {
    var self = this;
    var deferred = new Deferred();
    var rfs = window.requestFileSystem || window.webkitRequestFileSystem;
    rfs(PERSISTENT, 1024 * 1024,
      function(fs) {
        fs.root.getDirectory("taberareloo", {create : true},
          function(dirEntry) {
            self.dirEntry = dirEntry;
            deferred.callback(dirEntry);
          },
          function(e) {
            deferred.errback(new Error(e.message));
          }
        );
      },
      function (e) {
        deferred.errback(new Error(e.message));
      }
    );
    return deferred;
  },

  getPreferences : function(key) {
    var preferences = localStorage.getItem('patches_preferences');
    if (preferences) {
      preferences = JSON.parse(preferences);
    }
    else {
      preferences = {};
    }
    return key ? preferences[key] : preferences;
  },

  setPreferences : function(key, preference) {
    var preferences = this.getPreferences();
    if (preference) {
      preferences[key] = preference;
    }
    else {
      delete preferences[key];
    }
    localStorage.setItem('patches_preferences', JSON.stringify(preferences));
  },

  _register : function(fileEntry, url) {
    var fileName   = fileEntry.name;
    var preference = this.getPreferences(fileName) || {};
    var disabled   = preference.disabled || false;
    var script     = null;
    if (!disabled) {
      var patch = this[fileName] || {};
      if (patch.dom) {
        patch.dom.parentNode.removeChild(patch.dom);
      }
      script = document.createElement('script');
      script.src = fileEntry.toURL();
      document.body.appendChild(script);
console.log('Load patch: ' + fileEntry.fullPath);
      TBRL.Notification.notify({
        title   : fileName,
        message : 'Loaded'
      });
    }
    this.register({
      name      : fileName,
      disabled  : disabled,
      fileEntry : fileEntry,
      dom       : script
    });
    this.list.sort(function(a, b) {
      if (a.name == b.name) return 0;
      return (a.name < b.name) ? -1 : 1;
    });
    this.setPreferences(fileName, {
      disabled : disabled,
      origin   : url || 'local'
    });
  },

  unregister : function(fileEntry) {
    var fileName = fileEntry.name;
    var patch = this[fileName] || {};
    if (patch.dom) {
      patch.dom.parentNode.removeChild(patch.dom);
    }
    this.remove(fileName);
    this.setPreferences(fileName);
  },

  install : function(file) {
    var self = this;

    function save(fileName, file, url) {
      switch (file.type) {
        case 'text/plain' :
        case 'text/javascript' :
        case 'application/x-javascript' :
          break;
        default : return succeed();
      }
      if (!file.size) {
        return succeed();
      }
      var deferred = new Deferred();
      self.dirEntry.getFile(fileName, {create: true},
        function(fileEntry) {
          fileEntry.createWriter(function(fileWriter) {
            fileWriter.onwriteend = function() {
              this.onwriteend = null;
              this.truncate(this.position);
console.log('Install patch: ' + fileEntry.fullPath);
              TBRL.Notification.notify({
                title   : fileName,
                message : 'Installed'
              });
              self._register(fileEntry, url);
              deferred.callback(fileEntry);
            };
            fileWriter.write(file);
          });
        }
      );
      return deferred;
    }

    if (typeof file === 'string') {
      var url      = file;
      var fileName = url.replace(/\\/g,'/').replace(/.*\//, '');
      return request(url, {
        responseType: 'blob'
      }).addCallback(function(res) {
        return save(fileName, res.response, url).addCallback(function(fileEntry) {
          return fileEntry;
        });
      });
    }
    else {
      return save(file.name, file).addCallback(function(fileEntry) {
        return !!fileEntry;
      });
    }
  },

  uninstall : function(fileEntry) {
    var self = this;
    var deferred = new Deferred();

    function remove(fileName) {
      self.dirEntry.getFile(fileName, {},
        function(fileEntry) {
          fileEntry.remove(function() {
            self.unregister(fileEntry);
console.log('Uninstall patch: ' + fileEntry.fullPath);
            TBRL.Notification.notify({
              title   : fileName,
              message : 'Uninstalled'
            });
            deferred.callback(fileEntry);
          });
        },
        function(e) {
        }
      );
    }

    if (typeof fileEntry === 'string') {
      var fileName = fileEntry.replace(/\\/g,'/').replace(/.*\//, '');
      remove(fileName);
    }
    else {
      remove(fileEntry.name);
    }

    return deferred;
  },

  load : function() {
    var self = this;
    this.dirEntry.createReader().readEntries(function(fileEntries) {
      for (var i = 0, len = fileEntries.length ; i < len ; i++) {
        var fileEntry = fileEntries[i];
        self._register(fileEntry);
      }
    });
  },

  removeAll : function() {
    var self = this;
    this.values.forEach(function(patch) {
      self.uninstall(patch.fileEntry);
    });
  }
});
Patches.initailize().addCallback(function() {
  Patches.load();
});
