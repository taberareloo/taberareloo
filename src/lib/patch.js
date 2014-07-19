// -*- coding: utf-8 -*-
/*global update:true, Repository:true, chrome:true*/
/*global TBRL:true, request:true, semver:true*/
/*global $A:true, promiseAllHash:true*/
(function (exports) {
  'use strict';

  var Patches = exports.Patches = update(new Repository(), {
    dirEntry : null,

    initailize: function () {
      var self = this;
      return new Promise(function (resolve, reject) {
        var rfs = window.requestFileSystem || window.webkitRequestFileSystem;
        rfs(window.PERSISTENT, 1024 * 1024, function (fs) {
            fs.root.getDirectory('taberareloo', { create : true },
              function (dirEntry) {
                self.dirEntry = dirEntry;
                resolve();
              },
              reject
            );
          },
          reject
        );
      });
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
      var that = this;

      function save(fileName, file, url) {
        switch (file.type) {
        case 'text/plain':
        case 'text/javascript':
        case 'application/javascript':
        case 'application/x-javascript':
          break;
        default:
          return Promise.resolve();
        }

        if (!file.size) {
          return Promise.resolve();
        }

        return new Promise(function (resolve, reject) {
          that.getMetadata(file).then(function (metadata) {
            if (metadata) {
              that.dirEntry.getFile(fileName, { create: true },
                function (fileEntry) {
                  fileEntry.createWriter(
                    function (fileWriter) {
                      fileWriter.onwriteend = function () {
                        this.onwriteend = null;
                        this.truncate(this.position);
                        that.loadAndRegister(fileEntry, metadata, url).then(function (patch) {
                          console.log('Patch: Installed: ' + fileEntry.fullPath);
                          if (!no_alert) {
                            alert(chrome.i18n.getMessage('message_installed', fileName));
                          }
                          resolve(patch);
                        });
                      };
                      fileWriter.onerror = reject;
                      fileWriter.write(file);
                    },
                    reject
                  );
                },
                reject
              );
            } else {
              resolve();
            }
          });
        });
      }

      if (typeof file === 'string') {
        var url      = file;
        var fileName = url.replace(/\\/g, '/').replace(/.*\//, '');
        return request(url + '?_=' + (new Date()).getTime(), {
          responseType: 'blob'
        }).then(function (res) {
          return save(fileName, res.response, url).then(function (patch) {
            return !!patch;
          });
        });
      } else {
        return save(file.name, file).then(function (patch) {
          return !!patch;
        });
      }
    },

    uninstall : function (patch, no_alert) {
      var self = this;
      return new Promise(function (resolve, reject) {
        self.dirEntry.getFile(patch.name, {},
          function (fileEntry) {
            fileEntry.remove(
              function () {
                self.unregister(patch);
                console.log('Patch: Uninstalled: ' + fileEntry.fullPath);
                if (!no_alert) {
                  alert(chrome.i18n.getMessage('message_uninstalled', fileEntry.name));
                }
                resolve();
              },
              reject
            );
          },
          reject
        );
      });
    },

    loadAndRegister : function (fileEntry, metadata, url) {
      var self = this;
      var fileName   = fileEntry.name;
      var preference = this.getPreferences(fileName) || {};
      var disabled   = preference.disabled || false;

      return (
        metadata ? Promise.resolve(metadata) : this.getMetadata(fileEntry)
      ).then(function (metadata) {
        if (metadata) {
          var script = null;
          url = url || preference.origin || metadata.downloadURL;
          if (
            !disabled &&
            (
              metadata.include &&
              Array.isArray(metadata.include) &&
              (metadata.include.indexOf('background') !== -1)
            )
          ) {
            return new Promise(function (resolve, reject) {
              var patch = self[fileName] || {};
              if (patch.dom) {
                patch.dom.parentNode.removeChild(patch.dom);
              }
              script = document.createElement('script');
              script.src = fileEntry.toURL();
              script.onload = function () {
                console.log('Load patch: ' + fileEntry.fullPath);
                resolve(self._register(fileEntry, metadata, url, script));
              };
              script.onerror = reject;
              document.body.appendChild(script);
            });
          } else {
            return self._register(fileEntry, metadata, url, script);
          }
        } else {
          fileEntry.remove(function () {});
        }
      });
    },

    load : function () {
      var self = this;
      return new Promise(function (resolve, reject) {
        var _load = function (fileEntries) {
          var ds = {};
          fileEntries.sort(function (a, b) {
            if (a.name === b.name) {
              return 0;
            }
            return (a.name < b.name) ? -1 : 1;
          });
          fileEntries.forEach(function (fileEntry) {
            console.log('Loading: ' + fileEntry.fullPath);
            ds[fileEntry.name] = self.loadAndRegister(fileEntry);
          });
          return promiseAllHash(ds).then(function () {
            var patch_last_checked = parseInt(self.getLocalCookie('patch_last_checked'), 10);
            if (!patch_last_checked || (patch_last_checked < ((new Date()).getTime() - (60 * 60 * 1000)))) {
              self.checkUpdates();
            }
          });
        };

        var dirReader = self.dirEntry.createReader();
        var fileEntries = [];
        var readEntries = function () {
          dirReader.readEntries(function (entries) {
            if (!entries.length) {
              _load(fileEntries).then(function () {
                resolve();
              });
            } else {
              fileEntries = fileEntries.concat($A(entries));
              readEntries();
            }
          }, function (e) {
            reject(e);
          });
        };
        readEntries();
      });
    },

    removeAll : function () {
      var self = this;
      this.values.forEach(function (patch) {
        self.uninstall(patch);
      });
    },

    readFromFile : function (file) {
      return new Promise(function (resolve) {
        var reader = new FileReader();
        reader.onloadend = function (evt) {
          if (evt.target.readyState === FileReader.DONE) {
            resolve(evt.target.result);
          }
        };
        reader.readAsText(file);
      });
    },

    readFromFileEntry : function (fileEntry) {
      var self = this;
      return new Promise(function (resolve, reject) {
        fileEntry.file(
          function (file) {
            self.readFromFile(file).then(resolve, reject);
          },
          reject
        );
      });
    },

    getMetadata : function (fileEntry) {
      return ((fileEntry.file) ?
        this.readFromFileEntry(fileEntry) : this.readFromFile(fileEntry)
      ).then(function (script) {
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
      console.groupCollapsed('Patches: Load in ' + tab.url);
      var self = this;
      var promiseList = [];
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
          promiseList.push(new Promise(function (resolve) {
            self.readFromFileEntry(patch.fileEntry).then(function (script) {
              chrome.tabs.executeScript(tab.id, {
                code : script
              }, function (result) {
                if (typeof result !== 'undefined') {
                  console.log(patch.fileEntry.fullPath);
                }
                resolve();
              });
            });
          }));
        }
      });
      return Promise.all(promiseList).then(function () {
        console.groupEnd();
      });
    },

    loadInPopup : function (doc) {
      console.groupCollapsed('Patches: Load in popup');
      var promiseList = [];
      this.values.forEach(function (patch) {
        var preference = Patches.getPreferences(patch.name) || {};
        if (
          !preference.disabled &&
          patch.metadata.include && Array.isArray(patch.metadata.include) &&
          (patch.metadata.include.indexOf('popup') !== -1)
        ) {
          promiseList.push(new Promise(function (resolve, reject) {
            var script = doc.createElement('script');
            script.src = patch.fileEntry.toURL();
            script.onload = function () {
              console.log(patch.fileEntry.fullPath);
              resolve();
            };
            script.onerror = reject;
            (doc.body || doc.documentElement).appendChild(script);
          }));
        }
      });
      return Promise.all(promiseList).then(function () {
        console.groupEnd();
      });
    },

    loadInOptions : function (doc) {
      console.groupCollapsed('Patches: Load in options');
      var promiseList = [];
      this.values.forEach(function (patch) {
        var preference = Patches.getPreferences(patch.name) || {};
        if (
          !preference.disabled &&
          patch.metadata.include && Array.isArray(patch.metadata.include) &&
          (patch.metadata.include.indexOf('options') !== -1)
        ) {
          promiseList.push(new Promise(function (resolve, reject) {
            var script = doc.createElement('script');
            script.src = patch.fileEntry.toURL();
            script.onload = function () {
              console.log(patch.fileEntry.fullPath);
              resolve();
            };
            script.onerror = reject;
            (doc.body || doc.documentElement).appendChild(script);
          }));
        }
      });
      return Promise.all(promiseList).then(function () {
        console.groupEnd();
      });
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
      }).then(function (res) {
        return self.getMetadata(res.response).then(function (metadata) {
          if (!metadata || !metadata.version) {
            return false;
          }
          if (semver.gt(metadata.version, patch.metadata.version)) {
            console.log('Patch: Found new version: ' + url);
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
  Patches.initailize().then(function () {
    console.groupCollapsed('Patches: Load');
    Patches.load().then(function () {
      console.groupEnd();
      console.log('Patches: loaded!');
    });
  });

}(this));
/* vim: set sw=2 ts=2 et tw=80 : */
