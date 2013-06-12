// -*- coding: utf-8 -*-
/*global MochiKit:true, Repository:true, Deferred:true, succeed:true, chrome:true*/
/*global TBRL:true, request:true, semver:true, DeferredHash:true, DeferredList:true*/
(function (exports) {
  'use strict';

  var Patches = exports.Patches = MochiKit.Base.update(new Repository(), {
    dirEntry : null,

    initailize: function () {
      var self = this;
      var deferred = new Deferred();
      var rfs = window.requestFileSystem || window.webkitRequestFileSystem;
      rfs(window.PERSISTENT, 1024 * 1024, function (fs) {
          fs.root.getDirectory('taberareloo', { create : true },
            function (dirEntry) {
              self.dirEntry = dirEntry;
              deferred.callback();
            },
            function (e) {
              deferred.errback(e);
            }
          );
        },
        function (e) {
          deferred.errback(e);
        }
      );
      return deferred;
    },

    getPreferences : function (key) {
      var preferences = localStorage.getItem('patches_preferences');
      if (preferences) {
        preferences = JSON.parse(preferences);
      } else {
        preferences = {};
      }
      return key ? preferences[key] : preferences;
    },

    setPreferences : function (key, preference) {
      var preferences = this.getPreferences();
      if (preference) {
        preferences[key] = preference;
      } else {
        delete preferences[key];
      }
      localStorage.setItem('patches_preferences', JSON.stringify(preferences));
    },

    _register : function (fileEntry, metadata, origin, dom) {
      var fileName   = fileEntry.name;
      var preference = this.getPreferences(fileName) || {};
      var disabled   = preference.disabled || false;
      this.register({
        name      : fileName,
        disabled  : disabled,
        fileEntry : fileEntry,
        dom       : dom,
        metadata  : metadata
      });
      this.list.sort(function (a, b) {
        if (a.name === b.name) {
          return 0;
        }
        return (a.name < b.name) ? -1 : 1;
      });
      this.setPreferences(fileName, {
        disabled : disabled,
        origin   : origin
      });
      return this[fileName];
    },

    unregister : function (patch) {
      if (patch.dom) {
        patch.dom.parentNode.removeChild(patch.dom);
      }
      this.setPreferences(patch.name);
      this.remove(patch.name);
    },

    install : function (file, no_alert) {
      var self = this;

      function save(fileName, file, url) {
        switch (file.type) {
        case 'text/plain':
        case 'text/javascript':
        case 'application/javascript':
        case 'application/x-javascript':
          break;
        default:
          return succeed();
        }

        if (!file.size) {
          return succeed();
        }

        var deferred = new Deferred();

        self.getMetadata(file).addCallback(function (metadata) {
          if (metadata) {
            self.dirEntry.getFile(fileName, { create: true },
              function (fileEntry) {
                fileEntry.createWriter(
                  function (fileWriter) {
                    fileWriter.onwriteend = function () {
                      this.onwriteend = null;
                      this.truncate(this.position);
                      self.loadAndRegister(fileEntry, metadata, url).addCallback(function (patch) {
                        console.log('Install patch: ' + fileEntry.fullPath);
                        if (!no_alert) {
                          alert(chrome.i18n.getMessage('message_installed', fileName));
                        }
                        deferred.callback(patch);
                      });
                    };
                    fileWriter.onerror = function (e) {
                      deferred.errback(e);
                    };
                    fileWriter.write(file);
                  },
                  function (e) {
                    deferred.errback(e);
                  }
                );
              },
              function (e) {
                deferred.errback(e);
              }
            );
          } else {
            deferred.errback();
          }
        });

        return deferred;
      }

      if (typeof file === 'string') {
        var url      = file;
        var fileName = url.replace(/\\/g, '/').replace(/.*\//, '');
        return request(url + '?_=' + (new Date()).getTime(), {
          responseType: 'blob'
        }).addCallback(function (res) {
          return save(fileName, res.response, url).addCallback(function (patch) {
            return !!patch;
          });
        });
      } else {
        return save(file.name, file).addCallback(function (patch) {
          return !!patch;
        });
      }
    },

    uninstall : function (patch, no_alert) {
      var self = this;
      var deferred = new Deferred();

      self.dirEntry.getFile(patch.name, {},
        function (fileEntry) {
          fileEntry.remove(
            function () {
              self.unregister(patch);
              console.log('Uninstall patch: ' + fileEntry.fullPath);
              if (!no_alert) {
                alert(chrome.i18n.getMessage('message_uninstalled', fileEntry.name));
              }
              deferred.callback();
            },
            function (e) {
              deferred.errback(e);
            }
          );
        },
        function (e) {
          deferred.errback(e);
        }
      );

      return deferred;
    },

    loadAndRegister : function (fileEntry, metadata, url) {
      var self = this;
      var fileName   = fileEntry.name;
      var preference = this.getPreferences(fileName) || {};
      var disabled   = preference.disabled || false;

      return (
        metadata ? succeed(metadata) : this.getMetadata(fileEntry)
      ).addCallback(function (metadata) {
        if (metadata) {
          var script = null;
          if (
            !disabled &&
            (
              metadata.include &&
              Array.isArray(metadata.include) &&
              (metadata.include.indexOf('background') !== -1)
            )
          ) {
            var patch = self[fileName] || {};
            if (patch.dom) {
              patch.dom.parentNode.removeChild(patch.dom);
            }
            script = document.createElement('script');
            script.src = fileEntry.toURL();
            document.body.appendChild(script);
            console.log('Load patch: ' + fileEntry.fullPath);
          }
          url = url || preference.origin || metadata.downloadURL;
          return self._register(fileEntry, metadata, url, script);
        } else {
          fileEntry.remove(function () {});
        }
      });
    },

    load : function () {
      var self = this;
      this.dirEntry.createReader().readEntries(function (fileEntries) {
        var ds = {};
        for (var i = 0, len = fileEntries.length ; i < len ; i++) {
          var fileEntry = fileEntries[i];
          ds[fileEntry.name] = self.loadAndRegister(fileEntry);
        }
        return new DeferredHash(ds).addCallback(function () {
          var patch_last_checked = parseInt(self.getLocalCookie('patch_last_checked'), 10);
          if (!patch_last_checked || (patch_last_checked < ((new Date()).getTime() - (60 * 60 * 1000)))) {
            self.checkUpdates();
          }
        });
      });
    },

    removeAll : function () {
      var self = this;
      this.values.forEach(function (patch) {
        self.uninstall(patch);
      });
    },

    readFromFile : function (file) {
      var deferred = new Deferred();

      var reader = new FileReader();
      reader.onloadend = function (evt) {
        if (evt.target.readyState === FileReader.DONE) {
          deferred.callback(evt.target.result);
        }
      };
      reader.readAsText(file);

      return deferred;
    },

    readFromFileEntry : function (fileEntry) {
      var self = this;
      var deferred = new Deferred();

      fileEntry.file(
        function (file) {
          self.readFromFile(file).addCallback(function (script) {
            deferred.callback(script);
          });
        },
        function (e) {
          deferred.errback(e);
        }
      );

      return deferred;
    },

    getMetadata : function (fileEntry) {
      return ((fileEntry.file) ?
        this.readFromFileEntry(fileEntry) : this.readFromFile(fileEntry)
      ).addCallback(function (script) {
        var in_metadata = false;
        var metadata    = '';
        script.split(/\r?\n/).forEach(function (line) {
          if (!in_metadata && (line === '// ==Taberareloo==')) {
            in_metadata = true;
          } else if (in_metadata && (line === '// ==/Taberareloo==')) {
            in_metadata = false;
          } else if (in_metadata) {
            metadata += line.substring(2);
          }
        });
        var data = null;
        try {
          data = JSON.parse(metadata);
        } catch (e) {
          alert(chrome.i18n.getMessage('warning_metadata'));
        }
        return data;
      });
    },

    loadInTab : function (tab) {
      var self = this;
      this.values.forEach(function (patch) {
        var pattern = null;
        if (patch.metadata.match && Array.isArray(patch.metadata.match)) {
          var parsed = patch.metadata.match.map(self.parseMatchPattern).filter(function (pattern) {
            return (pattern !== null);
          });
          pattern = new RegExp(parsed.join('|'));
        }
        var preference = Patches.getPreferences(patch.name) || {};
        if (
          !preference.disabled &&
          patch.metadata.include && Array.isArray(patch.metadata.include) &&
          (patch.metadata.include.indexOf('content') !== -1) &&
          pattern && pattern.test(tab.url)
        ) {
          self.readFromFileEntry(patch.fileEntry).addCallback(function (script) {
            chrome.tabs.executeScript(tab.id, {
              code : script
            }, function () {});
            console.log('Load patch in ' + tab.url + ' : ' + patch.fileEntry.fullPath);
          });
        }
      });
    },

    loadInPopup : function (doc) {
      var deferredList = [];
      this.values.forEach(function (patch) {
        var preference = Patches.getPreferences(patch.name) || {};
        if (
          !preference.disabled &&
          patch.metadata.include && Array.isArray(patch.metadata.include) &&
          (patch.metadata.include.indexOf('popup') !== -1)
        ) {
          var deferred = new Deferred();
          var script = doc.createElement('script');
          script.src = patch.fileEntry.toURL();
          script.onload = function () {
            deferred.callback();
          };
          script.onerror = function () {
            deferred.errback();
          };
          (doc.body || doc.documentElement).appendChild(script);
          console.log('Load patch in popup : ' + patch.fileEntry.fullPath);
          deferredList.push(deferred);
        }
      });
      return new DeferredList(deferredList);
    },

    parseMatchPattern : function (input) {
      if (typeof input !== 'string') {
        return null;
      }

      function regEscape(s) {
        return s.replace(/[[^$.|?*+(){}\\]/g, '\\$&');
      }
      var match_pattern = '(?:^';
      var result = /^(\*|https?|file|ftp|chrome-extension):\/\//.exec(input);

      // Parse scheme
      if (!result) {
        return null;
      }
      input = input.substr(result[0].length);
      match_pattern += result[1] === '*' ? 'https?://' : result[1] + '://';

      // Parse host if scheme is not `file`
      if (result[1] !== 'file') {
        if (!(result = /^(?:\*|(\*\.)?([^\/*]+))/.exec(input))) {
          return null;
        }
        input = input.substr(result[0].length);
        if (result[0] === '*') {    // host is '*'
          match_pattern += '[^/]+';
        } else {
          if (result[1]) {         // Subdomain wildcard exists
            match_pattern += '(?:[^/]+\\.)?';
          }
          // Append host (escape special regex characters)
          match_pattern += regEscape(result[2]);
        }
      }
      // Add remainder (path)
      match_pattern += input.split('*').map(regEscape).join('.*');
      match_pattern += '$)';
      return match_pattern;
    },

    checkUpdates : function () {
      var self = this;
      this.setLocalCookie('patch_last_checked', (new Date()).getTime());
      this.values.forEach(function (patch) {
        self.checkUpdate(patch);
      });
    },

    checkUpdate : function (patch) {
      var self = this;

      if (!patch.metadata.version || !patch.metadata.downloadURL) {
        return false;
      }

      var url      = patch.metadata.downloadURL;
      var fileName = url.replace(/\\/g, '/').replace(/.*\//, '');
      return request(url + '?_=' + (new Date()).getTime(), {
        responseType: 'blob'
      }).addCallback(function (res) {
        return self.getMetadata(res.response).addCallback(function (metadata) {
          if (!metadata || !metadata.version) {
            return false;
          }
          if (semver.gt(metadata.version, patch.metadata.version)) {
            console.log('Found new version: ' + url);
            TBRL.Notification.notify({
              title   : fileName,
              message : chrome.i18n.getMessage('message_released'),
              onclick : function () {
                window.open(url, '');
                this.close();
              }
            });
            return true;
          }
          return false;
        });
      });
    },

    setLocalCookie : function (c_name, value) {
      document.cookie = c_name + '=' + encodeURIComponent(value);
    },

    getLocalCookie : function (c_name) {
      var c_value = document.cookie;
      var c_start = c_value.indexOf(' ' + c_name + '=');
      if (c_start === -1) {
        c_start = c_value.indexOf(c_name + '=');
      }
      if (c_start === -1) {
        c_value = null;
      } else {
        c_start = c_value.indexOf('=', c_start) + 1;
        var c_end = c_value.indexOf(';', c_start);
        if (c_end === -1) {
          c_end = c_value.length;
        }
        c_value = decodeURIComponent(c_value.substring(c_start, c_end));
      }
      return c_value;
    }
  });
  Patches.initailize().addCallback(function () {
    Patches.load();
  });

}(this));
/* vim: set sw=2 ts=2 et tw=80 : */
