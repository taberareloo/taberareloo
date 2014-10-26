// -*- coding: utf-8 -*-
/*global CommandQueue:true, defer:true, promiseAllHash:true*/
/*global TBRL:true, update:true, addBefore:true*/
/*global request:true, createHTML:true, chrome:true, queryString:true, getFileFromEntry:true */
/*global base64ToBlob:true, createFileEntryFromBlob:true, download:true*/
/*global joinText:true, getCookies:true, $X:true, getFileExtension:true, getFlavor:true*/
/*global fileToBinaryString:true, Sandbox:true, formContents:true, unescapeHTML:true*/
/*global items:true, $A:true, map:true, templateExtract:true, convertToHTMLString:true*/
/*global escape:true, SparkMD5:true, arrayZip:true*/
/*global escapeHTML:true, getURLFromFile:true, fileToDataURL:true, isJSON:true*/
/*global Repository:true, cutBase64Header:true, fileToPNGDataURL:true, getFinalUrl:true*/
(function (exports) {
  'use strict';

  var skin = chrome.runtime.getURL('skin/');
  var Models = exports.Models = new Repository();

  var Tumblr = {
    name : 'Tumblr',
    ICON : 'http://assets.tumblr.com/images/favicon.gif',
    MEDIA_URL : 'http://media.tumblr.com/',
    TUMBLR_URL : 'https://www.tumblr.com/',
    LINK : 'https://www.tumblr.com/',
    LOGIN_URL : 'https://www.tumblr.com/login',

    queue : new CommandQueue(500),

    /**
     * ポストを削除する。
     *
     * @param {Number || String} id ポストID。
     * @return {Promise}
     */
    remove : function (id) {
      return this.getToken().then(function (token) {
        return request(Tumblr.TUMBLR_URL + 'delete', {
          //denyRedirection: true,
          referrer    : Tumblr.TUMBLR_URL,
          sendContent : {
            id          : id,
            form_key    : token,
            redirect_to : 'dashboard'
          }
        });
      });
    },

    /**
     * reblog情報を取り除く。
     *
     * @param {Array} form reblogフォーム。
     * @return {Promise}
     */
    trimReblogInfo : function (form) {
      if (!TBRL.Config['entry']['trim_reblog_info']) {
        return null;
      }

      function trimQuote(entry) {
        entry = entry.replace(/<p><\/p>/g, '').replace(/<p><a[^<]+<\/a>:<\/p>/g, '');
        entry = (function callee(all, contents) {
          return contents.replace(/<blockquote>(([\n\r]|.)+)<\/blockquote>/gm, callee);
        })(null, entry);
        return entry.trim();
      }

      switch (form['post[type]']) {
      case 'link':
        form['post[three]'] = trimQuote(form['post[three]']);
        break;
      case 'regular':
      case 'photo':
      case 'video':
        form['post[two]'] = trimQuote(form['post[two]']);
        break;
      case 'quote':
        form['post[two]'] = form['post[two]'].replace(/ \(via <a.*?<\/a>\)/g, '').trim();
        break;
      }

      return form;
    },

    /**
     * ポスト可能かをチェックする。
     *
     * @param {Object} ps
     * @return {Boolean}
     */
    check : function (ps) {
      return /regular|photo|quote|link|conversation|video|audio/.test(ps.type) && ((ps.type !== 'audio') || ps.suffix === '.mp3');
    },


    _post : function (form) {
      return this.queue.push(function () {
        return request(Tumblr.TUMBLR_URL + 'svc/secure_form_key', {
          method  : 'POST',
          headers : {
            'X-tumblr-form-key' : form.form_key
          }
        }).then(function (res) {
          var secure_form_key = res.getResponseHeader('X-tumblr-secure-form-key');
          return request(Tumblr.TUMBLR_URL + 'svc/post/update', {
            headers     : {
              'Content-Type'     : 'application/json',
              'X-tumblr-puppies' : secure_form_key
            },
            sendContent : JSON.stringify(form)
          });
        });
      });
    },

    /**
     * 新規エントリーをポストする。
     *
     * @param {Object} ps
     * @return {Promise}
     */
    post : function (ps) {
      var self = this;
      if (TBRL.Config.post['tumblr_default_quote']) {
        ps = update({}, ps);
        ps.flavors = update({}, ps.flavors);
        delete ps['flavors']['html'];
      }
      var endpoint = Tumblr.TUMBLR_URL + 'new/' + ps.type;
      return this.postForm(function () {
        return self.getForm(endpoint).then(function postUpdate(form) {
          var type;
          type = ps.type.capitalize();
          return Tumblr[type].convertToForm(ps).then(function (form2) {
            // merging forms
            update(form, form2);
            self.appendTags(form, ps);

            if (TBRL.Config.post.multi_tumblelogs && !Tumblr.blogs.some(function (id) { return id === form.channel_id; })) {
              throw new Error(chrome.i18n.getMessage('error_notLoggedin', form.channel_id));
            }

            return (function () {
              if (type === 'Photo') {
                if (form['photo[]']) {
                  return request(Tumblr.TUMBLR_URL + 'svc/post/upload_photo', {
                    sendContent: form
                  }).then(function (res) {
                    var response = JSON.parse(res.responseText);

                    if (response.meta && response.meta.msg === 'OK' && response.meta.status === 200) {
                      delete form['photo[]'];
                      form['images[o1]'] = response.response[0].url;
                      form['post[photoset_layout]'] = '1';
                      form['post[photoset_order]'] = 'o1';

                      return self._post(form);
                    }

                    return res;
                  });
                } else {
                  form['images[o1]'] = form['photo_src[]'];
                  form['post[photoset_layout]'] = '1';
                  form['post[photoset_order]'] = 'o1';
                }
              }

              return self._post(form);
            }()).catch(function (err) {
              if (self.retry) {
                throw err;
              }

              Tumblr.form_key = Tumblr.channel_id = null;
              self.retry = true;

              return self.getForm(endpoint).then(postUpdate);
            });
          });
        });
      });
    },

    /**
     * ポストフォームを取得する。
     * reblogおよび新規エントリーのどちらでも利用できる。
     *
     * @param {Object} url フォームURL。
     * @return {Promise}
     */
    getForm : function (url) {
      var form = {
        form_key: Tumblr.form_key,
        channel_id: Tumblr.channel_id,
        context_id: '',
        context_page: 'dashboard',
        custom_tweet: '',
        'post[date]': '',
        'post[draft_status]': '',
        'post[publish_on]': '',
        'post[slug]': '',
        'is_rich_text[one]': '0',
        'is_rich_text[three]': '0',
        'is_rich_text[two]': '0',
        'post[state]': '0',
        allow_photo_replies: '',
        send_to_fbog: TBRL.Config.entry.tumblr2facebook ? 'on' : '',
        send_to_twitter: TBRL.Config.entry.tumblr2twitter ? 'on' : ''
      };
      var that = this;

      if (form.form_key && form.channel_id) {
        return Promise.resolve(form);
      }

      if (TBRL.Config.post.multi_tumblelogs) {
        return Models.getMultiTumblelogs(true).then(function () {
          form.form_key = Tumblr.form_key;
          form.channel_id = Tumblr.channel_id;

          return form;
        });
      }

      return request(url, { responseType: 'document' }).then(function (res) {
        var doc = res.response;
        if ($X('id("logged_out_container")', doc)[0]) {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
        }

        form.form_key = Tumblr.form_key = $X('//input[@name="form_key"]/@value', doc)[0];
        form.channel_id = Tumblr.channel_id = $X('//input[@name="t"]/@value', doc)[0];

        return form;
      });
    },

    /**
     * フォームへタグとプライベートを追加する。
     *
     * @param {Object} url フォームURL。
     * @return {Promise}
     */
    appendTags : function (form, ps) {
      form['post[state]'] = (ps.private) ? 'private' : '0';
      if (TBRL.Config.post['post_with_queue']) {
        if (ps.type !== 'regular') {
          if (!(
            TBRL.Config.post['not_queue_reblog_post'] &&
              ps.favorite && ps.favorite.name === 'Tumblr'
          )) {
            form['post[state]'] = 2;
          }
        }
      }

      if (TBRL.Config['entry']['append_content_source']) {
        if (!(ps.favorite) ||
            !(ps.favorite.name) ||
            ps.favorite.name !== 'Tumblr') {
          // not reblog post
          if (ps.pageUrl && ps.pageUrl !== 'http://') {
            form['post[source_url]'] = ps.pageUrl;
            if (ps.type !== 'link') {
              form['post[three]'] = ps.pageUrl;
            }
          }
        }
      }

      return update(form, {
        'post[tags]' : (ps.tags && ps.tags.length)? joinText(ps.tags, ',') : ''
      });
    },

    /**
     * reblogする。
     * Tombloo.Service.extractors.ReBlogの各抽出メソッドを使いreblog情報を抽出できる。
     *
     * @param {Object} ps
     * @return {Promise}
     */
    favor : function (ps) {
      // メモをreblogフォームの適切なフィールドの末尾に追加する
      var form = ps.favorite.form;
      var that = this;

      this.trimReblogInfo(form);

      return Tumblr[ps.type.capitalize()].convertToForm({
        description : ps.description
      }).then(function (res) {
        items(res).forEach(function (item) {
          var name = item[0], value = item[1];
          if (!value) {
            return;
          }
          if (form[name]) {
            form[name] += '\n\n' + value;
          } else {
            form[name] = value;
          }
        });
        that.appendTags(form, ps);
        return that.postForm(function () {
          return that._post(form);
        });
      });
    },

    /**
     * フォームをポストする。
     * 新規エントリーとreblogのエラー処理をまとめる。
     *
     * @param {Function} fn
     * @return {Promise}
     */
    postForm : function (fn) {
      var self = this;
      return defer().then(fn).then(function (res) {
        if (self.retry) {
          self.retry = false;
        }

        var response = res.responseText;

        if (isJSON(response)) {
          var errors = JSON.parse(response).errors;
          if (errors) {
            if (Array.isArray(errors)) {
              // daily post limit
              throw new Error(errors.join(''));
            } else if (errors.type) {
              // daily photo upload limit
              throw new Error(errors.type);
            } else {
              // unexpected error
              throw new Error(JSON.stringify(errors));
            }
          }
          return null;
        }

        var doc = createHTML(response);
        if ($X('id("logged_out_container")', doc)[0]) {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
        } else if ($X('id("posts")', doc)[0]) {
          return null;
        } else if (response.match('more tomorrow')) {
          throw new Error('You\'ve exceeded your daily post limit.');
        } else {
          throw new Error(doc.getElementById('errors').textContent.trim());
        }
      });
    },

    /**
     * ポストや削除に使われるトークン(form_key)を取得する。
     * 結果はキャッシュされ、再ログインまで再取得は行われない。
     *
     * @return {Promise} トークン(form_key)が返される。
     */
    getToken : function () {
      var self = this;
      return request(Tumblr.TUMBLR_URL + 'new/text', { responseType: 'document' }).then(function (res) {
        var doc = res.response;
        if ($X('id("logged_out_container")', doc)[0]) {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
        }
        self.token = $X('//input[@name="form_key"]/@value', doc)[0];
        return self.token;
      });
    },

    getTumblelogs : function () {
      var self = this;
      return request(Tumblr.LINK + 'dashboard', { responseType: 'document' }).then(function (res) {
        var doc = res.response;
        if ($X('id("account_actions_login_and_register")', doc)[0]) {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
        }
        Tumblr.form_key = $X('//input[@name="form_key"]/@value', doc)[0];
        Tumblr.channel_id = $X('//input[@name="t"]/@value', doc)[0];
        Tumblr.blogs = [Tumblr.channel_id];
        return Array.prototype.slice.call(doc.querySelectorAll(
          '#popover_blogs .popover_menu_item ' +
            'a[href^="/blog/"]:not([href="/blog/' + Tumblr.channel_id + '"])'
        )).reverse().map(function (a) {
          var id = a.getAttribute('href').replace(/^\/blog\//g, '');
          Tumblr.blogs.push(id);

          return {
            id : id,
            name: a.textContent.trim()
          };
        });
      });
    }
  };


  Tumblr.Regular = {
    convertToForm : function (ps) {
      return Promise.resolve({
        'post[type]' : ps.type,
        'post[one]'  : ps.item,
        'post[two]'  : joinText([getFlavor(ps, 'html'), ps.description], '\n\n')
      });
    }
  };

  Tumblr.Photo = {
    convertToForm : function (ps) {
      // Tumblrのバグで画像がリダイレクトすると投稿できないので，予めリダイレクト先を調べておく
      return (ps.itemUrl ? getFinalUrl(ps.itemUrl) : Promise.resolve(null)).then(function (finalUrl) {
        var form = {
          'post[type]'  : ps.type,
          'post[two]'   : joinText([
            (ps.item? ps.item.link(ps.pageUrl) : '') + (ps.author? ' (via ' + ps.author.link(ps.authorUrl) + ')' : ''),
            ps.description], '\n\n'),
          'post[three]' : ps.pageUrl,
          MAX_FILE_SIZE: '10485760'
        };
        if (ps.file) {
          form['photo[]'] = ps.file;
        } else {
          form['photo_src[]'] = finalUrl;
        }
        return form;
      });
    }
  };

  Tumblr.Video = {
    convertToForm : function (ps) {
      return Promise.resolve({
        'post[type]' : ps.type,
        'post[one]'  : getFlavor(ps, 'html') || ps.itemUrl,
        'post[two]'  : joinText([
          (ps.item? ps.item.link(ps.pageUrl) : '') + (ps.author? ' (via ' + ps.author.link(ps.authorUrl) + ')' : ''),
          ps.description], '\n\n'),
        MAX_FILE_SIZE: '104857600'
      });
    }
  };

  Tumblr.Link = {
    convertToForm : function (ps) {
      var thumb = '';
      if (ps.pageUrl) {
        thumb = TBRL.Config['entry']['thumbnail_template'].replace(new RegExp('{url}', 'g'), ps.pageUrl);
      }
      return Promise.resolve({
        'post[type]'  : ps.type,
        'post[one]'   : ps.item,
        'post[two]'   : ps.itemUrl,
        'post[three]' : joinText([thumb, getFlavor(ps, 'html'), ps.description], '\n\n')
      });
    }
  };

  Tumblr.Conversation = {
    convertToForm : function (ps) {
      return Promise.resolve({
        'post[type]' : ps.type,
        'post[one]'  : ps.item,
        'post[two]'  : joinText([getFlavor(ps, 'html'), ps.description], '\n\n')
      });
    }
  };

  Tumblr.Quote = {
    convertToForm : function (ps) {
      return Promise.resolve({
        'post[type]' : ps.type,
        'post[one]'  : getFlavor(ps, 'html'),
        'post[two]'  : joinText([(ps.item? ps.item.link(ps.pageUrl) : ''), ps.description], '\n\n')
      });
    }
  };

  Tumblr.Audio = {
    convertToForm : function (ps) {
      var res = {
        'post[type]'  : ps.type,
        'post[two]'   : joinText([(ps.item? ps.item.link(ps.pageUrl) : ''), ps.description], '\n\n'),
        MAX_FILE_SIZE: '10485760'
      };
      if (ps.itemUrl) {
        res['post[three]'] = ps.itemUrl;
      }
      return Promise.resolve(res);
    }
  };

  Models.register(Tumblr);

  Models.register({
    name : '4u',
    ICON : skin + '4u.ico',
    LINK : 'http://4u-beautyimg.com/',
    LOGIN_URL : 'http://4u-beautyimg.com/admin/login',
    URL : 'http://4u-beautyimg.com/',

    check : function (ps) {
      return ps.type === 'photo' && !ps.file;
    },

    post : function (ps) {
      var self = this;
      return request(this.URL + 'power/manage/register', {
        referrer : ps.pageUrl,
        queryString : {
          site_title  : ps.page,
          site_url    : ps.pageUrl,
          alt         : ps.item,
          src         : ps.itemUrl,
          bookmarklet : 1
        }
      }).then(function (res) {
        if (/login/.test(res.responseText)) {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
        }
      });
    },

    favor : function (ps) {
      return this.iLoveHer(ps.favorite.id);
    },

    iLoveHer : function (id) {
      var self = this;
      return request(this.URL + 'user/manage/do_register', {
        redirectionLimit : 0,
        referrer : this.URL,
        responseType: 'document',
        queryString : {
          src : id
        }
      }).then(function (res) {
        var doc = res.response;
        if ($X('//form[@action="' + this.URL + 'admin/login"]', doc)[0]) {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
        }
      });
    }
  });

  Models.register({
    name : 'FFFFOUND',
    ICON : 'http://ffffound.com/favicon.ico',
    LINK : 'http://ffffound.com/',
    URL  : 'http://ffffound.com/',

    getToken : function () {
      return request(this.URL + 'bookmarklet.js').then(function (res) {
        return res.responseText.match(/token ?= ?'(.*?)'/)[1];
      });
    },

    check : function (ps) {
      return ps.type === 'photo' && !ps.file;
    },

    post : function (ps) {
      var self = this;
      return this.getToken().then(function (token) {
        return request(self.URL + 'add_asset', {
          referrer : ps.pageUrl,
          queryString : {
            token   : token,
            url     : ps.itemUrl,
            referer : ps.pageUrl,
            title   : ps.item,
          },
        }).then(function (res) {
          if (res.responseText.match('(FAILED:|ERROR:) +(.*?)</span>')) {
            throw new Error(RegExp.$2.trim());
          }

          if (res.responseText.match('login')) {
            throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
          }
        });
      });
    },

    favor : function (ps) {
      return this.iLoveThis(ps.favorite.id);
    },

    remove : function (id) {
      return request(this.URL + 'gateway/in/api/remove_asset', {
        referrer : this.URL,
        sendContent : {
          collection_id : id,
        },
      });
    },

    iLoveThis : function (id) {
      var self = this;
      return request(this.URL + 'gateway/in/api/add_asset', {
        referrer : this.URL,
        sendContent : {
          collection_id : 'i' + id,
          inappropriate : false,
        },
      }).then(function (res) {
        var error = res.responseText.extract(/"error":"(.*?)"/);
        if (error === 'AUTH_FAILED') {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
        }

        // NOT_FOUND / EXISTS / TOO_BIG
        if (error) {
          throw new Error(RegExp.$1.trim());
        }
      });
    },
  });

  Models.register({
    name : 'Local',
    ICON : skin + 'local.ico',

    check : function (ps) {
      return ps.type === 'photo';
    },

    post : function (ps) {
      var self = this;
      return this.getDataURL(ps).then(function (url) {
        if (chrome.downloads) {
          return self.download(url);
        } else {
          return self.Photo.post(ps, url);
        }
      });
    },

    download : function (url) {
      return new Promise(function (resolve, reject) {
        chrome.downloads.download({url : url}, function (id) {
          if (id) {
            return resolve();
          } else {
            return reject(chrome.runtime.lastError.message);
          }
        });
      });
    },

    getDataURL : function (ps) {
      if (!ps.file) {
        return Promise.resolve(ps.itemUrl);
      }
      return fileToDataURL(ps.file).then(function (url) { return url; });
    },

    Photo : {
      queue: [],
      post : function (ps, url) {
        var that = this;
        if (!/^(?:http|data)/.test(url)) {
          return Promise.reject('ps.itemUrl is not URL');
        }

        // Now, latest version of Chromium, background and chrome url pages cannot download images.
        // So at first, we search normal http url tab in all tabs.
        // If it is found, we request download operation to this tab.
        // But if it is not found, we enqueue img url to this model, and at next Local post request,
        // we retry queue contents.
        function executor(urls) {
          function dispatch(url) {
            var anchor = document.createElement('a');
            anchor.href = url;
            anchor.dispatchEvent(new MouseEvent('click', {altKey: true}));
          }

          urls.forEach(function downloader(url) {
            if (/http|https/.test(url)) {
              dispatch(url);
            } else {
              // probably data url
              dispatch(getURLFromFile(base64ToBlob(url, 'image/png')));
            }
          });
        }

        function ok(tab) {
          var ary;
          if (that.queue.length !== 0) {
            ary = that.queue;
            that.queue = [];
            ary.push(url);
          } else {
            ary = [ url ];
          }
          var code = '(' + executor.toString() + '(' + JSON.stringify(ary) + '))';
          chrome.tabs.executeScript(tab.id, {
            code: code
          }, function () { });
        }

        chrome.tabs.query({
          active: true,
          currentWindow: true
        }, function (tabs) {
          if (tabs.length === 0 || /^(?:chrome|https)/.test(tabs[0].url)) {
            chrome.tabs.query({
              url: 'http://*/*',
              active: true,
              highlighted: true,
              windowType: 'normal'
            }, function (tabs) {
              if (tabs.length === 0) {
                chrome.tabs.query({
                  url: 'https://*/*',
                  active: true,
                  highlighted: true,
                  windowType: 'normal'
                }, function (tabs) {
                  if (tabs.length === 0) {
                    chrome.tabs.query({
                      url: 'http://*/*',
                      windowType: 'normal'
                    }, function (tabs) {
                      if (tabs.length === 0) {
                        that.queue.push(url);
                        return;
                      }
                      ok(tabs[0]);
                    });
                    return;
                  }
                  ok(tabs[0]);
                });
                return;
              }
              ok(tabs[0]);
            });
          } else {
            ok(tabs[0]);
          }
        });
        return Promise.resolve();
      }
    }
  });

  var Hatena = {
    name : 'Hatena',
    ICON : 'http://www.hatena.ne.jp/favicon.ico',
    JSON : 'http://b.hatena.ne.jp/my.name',

    getToken : function () {
      if (this.data) {
        return Promise.resolve(this.data);
      } else {
        var that = this;
        return request(this.JSON, { responseType: 'json' }).then(function (res) {
          var data = res.response;
          if (!data['login']) {
            delete that['data'];
            throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
          }
          that.data  = data;
          return that.data;
        });
      }
    },

    reprTags: function (tags) {
      return tags ? tags.map(function (t) {
        return '[' + t + ']';
      }).join('') : '' ;
    }
  };

  Models.register(Hatena);

  // FIXME
  // thx id: secondlife & Hatena.inc
  Models.register({
    name : 'HatenaFotolife',
    ICON : 'http://f.hatena.ne.jp/favicon.ico',
    LINK : 'http://f.hatena.ne.jp/',
    LOGIN_URL : 'https://www.hatena.ne.jp/login',

    check : function (ps) {
      return ps.type === 'photo';
    },

    getToken : function () {
      var self = this;
      return Hatena.getToken().catch(function (e) {
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      });
    },

    post : function (ps) {
      var that = this;
      return (ps.file ? Promise.resolve(ps.file) : download(ps.itemUrl).then(function (entry) {
        return getFileFromEntry(entry);
      })).then(function (file) {
        return fileToPNGDataURL(file).then(function (container) {
          return that.uploadWithBase64(container);
        });
        // TODO(Constellation) extension guess
  //      return that.upload({
  //        fototitle1: ps.item || ps.page,
  //        image1: file
  //      });
      });
    },

    // image1 - image5
    // fototitle1 - fototitle5 (optional)
    upload : function (ps) {
      return this.getToken().then(function (set) {
        ps.rkm = set['rkm'];
        return request('http://f.hatena.ne.jp/' + set['name'] + '/up', {
          sendContent : update({
            mode : 'enter'
          }, ps)
        });
      });
    },

    uploadWithBase64 : function (file) {
      return this.getToken().then(function (set) {
        var name = set['name'];
        var rkm  = set['rkm'];
        return request('http://f.hatena.ne.jp/' + name + '/haiku', {
          method: 'POST',
          sendContent: {
            name : name,
            rkm  : rkm,
            ext  : 'png',
            model: 'capture',
            image: cutBase64Header(file.binary),
            fotosize: Math.max(file.height, file.width),
            folder  : ''
        }
        });
      });
    }
  });

  Models.register({
    name : 'HatenaBookmark',
    ICON : 'http://b.hatena.ne.jp/favicon.ico',
    LINK : 'http://b.hatena.ne.jp/',
    LOGIN_URL : 'https://www.hatena.ne.jp/login',

    POST_URL : 'http://b.hatena.ne.jp/add',
    JSON_URL : 'http://b.hatena.ne.jp/my.name',

    check : function (ps) {
      return /photo|quote|link|conversation|video/.test(ps.type) && !ps.file;
    },

    post : function (ps) {
      // タイトルは共有されているため送信しない
      return this.addBookmark(ps.itemUrl, null, ps.tags, joinText([ps.body, ps.description], ' ', true));
    },

    getToken : function () {
      var self = this;
      return Hatena.getToken().catch(function (e) {
        delete self['tags'];
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      });
    },

    addBookmark : function (url, title, tags, description) {
      return this.getToken().then(function (data) {
        return request('http://b.hatena.ne.jp/bookmarklet.edit', {
          //denyRedirection: true,
          method: 'POST',
          sendContent : {
            rks     : data['rks'],
            url     : url.replace(/%[0-9a-f]{2}/g, function (s) {
              return s.toUpperCase();
            }),
            title   : title,
            comment : Hatena.reprTags(tags) + description.replace(/[\n\r]+/g, ' ')
          }
        });
      });
    },

    /**
     * タグ、おすすめタグ、キーワードを取得する
     * ページURLが空の場合、タグだけが返される。
     *
     * @param {String} url 関連情報を取得する対象のページURL。
     * @return {Object}
     */
    getSuggestions : function (url) {
      var that = this;
      return this.getToken().then(function (set) {
        return promiseAllHash({
          tags: that.getUserTags(set['name']),
          data: that.getURLData(url)
        }).catch(function () {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
        });
      }).then(function (table) {
        var data = table['data'];
        return {
          duplicated : !!data['bookmarked_data'],
          recommended : data['recommend_tags'],
          tags : table['tags']
        };
      });
    },

    getUserTags: function (user) {
      var that = this;
      var tags = that.tags;
      if (tags) {
        return Promise.resolve(tags);
      } else {
        return request('http://b.hatena.ne.jp/' + user + '/tags.json', { responseType: 'json' }).then(function (res) {
          var json = res.response;
          if (!json) {
            throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
          }
          tags = json.tags;
          that.tags = items(tags).map(function (pair) {
            return {
              name      : pair[0],
              frequency : pair[1].count
            };
          });
          return that.tags;
        });
      }
    },

    getURLData: function (url) {
      var that = this;
      return request('http://b.hatena.ne.jp/my.entry', {
        queryString : {
          url  : url
        },
        responseType: 'json'
      }).then(function (res) {
        var json = res.response;
        if (!json) {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
        }
        return json;
      });
    }
  });

  Models.register({
    name : 'HatenaBlog',
    ICON : 'http://hatenablog.com/images/favicon.ico',
    LINK : 'http://hatenablog.com/',
    LOGIN_URL : 'https://www.hatena.ne.jp/login',
    CONFIG_DETAIL_URL: 'http://blog.hatena.ne.jp/my/config/detail',
    ADMIN_TOP_URL: 'http://blog.hatena.ne.jp/',
    BLOG_ADMIN_URL: undefined, // 個別のブログのインスタンスで定義される

    getBlogs : function () {
      var self = this;
      return Hatena.getToken().then(function () {
        return request(self.ADMIN_TOP_URL, { responseType: 'document' }).then(function (res) {
          var doc = res.response;
          var sidebarElements = $A(doc.querySelectorAll('.sidebar-index .admin-menu-blogpath'));
          var blogBoxElements = $A(doc.querySelectorAll('.main-box .myblog-box'));
          return $A(sidebarElements).map(function (sidebarElement) {
            var blogBoxElement = blogBoxElements.shift();
            return {
              url:       blogBoxElement.querySelector('.blog-host a').href,
              title:     sidebarElement.textContent.replace(/^\s*/, '').replace(/\s*$/, ''),
              admin_url: sidebarElement.querySelector('a').href,
              icon_url:  sidebarElement.querySelector('img').src
            };
          });
        });
      });
    },

    getUserName: function () {
      return Hatena.getToken().then(function (set) {
        return set['name'];
      });
    },

    getApiKey : function () {
      var model = Models.HatenaBlog;
      if (model.token) {
        return Promise.resolve(model.token);
      } else {
        return Hatena.getToken().then(function () {
          return request(model.CONFIG_DETAIL_URL, { responseType: 'document' }).then(function (res) {
            var doc = res.response;
            var tokenElement = doc.querySelector('.api-key');
            if (!tokenElement) {
              throw new Error('HatenaBlog#getToken: failed to find ApiKey');
            }
            model.token = tokenElement.textContent;
            return model.token;
          }).catch(function (e) {
            model.token = undefined;
            throw new Error('HatenaBlog#getToken: ' +
                  (e.message.hasOwnProperty('status') ? '\n' + ('HTTP Status Code ' + e.message.status).indent(4) : '\n' + e.message.indent(4)));
          });
        });
      }
    },

    // ここでcheckを定義すると，HatenaBlog自体が投稿可能になってしまう．
    // Models.HatenaBlog自体は投稿可能ではなく，ユーザーの持っている個別のブログに投稿できる．
    // ここではなく，getBlogsしたあとにcheckを定義しています．
    _check : function (ps) {
      return /regular|quote|link|video/.test(ps.type) || (ps.type === 'photo' && !ps.file);
    },

    post : function (ps) {
      var self = this;

      var template;
      if (ps.type === 'regular') {
        template = '<p>%body%</p>';
      } else if (ps.type === 'quote') {
        template = '<blockquote>' +
                     '%body%' +
                     '<p><cite><a href="%pageUrl%">%page%</a></cite></p>' +
                   '</blockquote>';
      } else if (ps.type === 'photo') {
        template = '<p><a href="%pageUrl%"><img src="%itemUrl%"></a></p>' +
                   '<p><cite><a href="%pageUrl%">%page%</a></cite></p>';
      } else if (ps.type === 'link') {
        template = '<p><a href="%itemUrl%">%item%</a></p>';
      } else if (ps.type === 'video') {
        template = '<p>%itemUrl%:embed</p>' +
                   '<p><a href="%itemUrl%">%item%</a></p>';
      }

      if (ps.description) {
        template += '<p>%description%</p>';
      }

      var data = {
        body        : self.paragraph(ps.body),
        description : self.paragraph(ps.description),
        item        : escapeHTML(ps.item || ''),
        itemUrl     : escapeHTML(ps.itemUrl || ''),
        page        : escapeHTML(ps.page || ''),
        pageUrl     : escapeHTML(ps.pageUrl || '')
      };

      var body = templateExtract(template, data);

      // regularのときはユーザーがタイトルを入力できる．
      // pageとitemが一致しないとき，ユーザーが何か入力しているので，タイトルに設定する．
      var title = '';
      if (ps.type === 'regular' || ps.page !== ps.item) {
        title = ps.item;
      }

      return self.getUserName().then(function (userName) {
        self.getApiKey().then(function (apiKey) {
          var xml = self.generateXML({
            userName   : escapeHTML(userName),
            title      : escapeHTML(title),
            body       : escapeHTML(body),
            isDraft    : escapeHTML('false'),
            categories : ps.tags
          });

          return request(self.postEndpoint(), {
            method      : 'post',
            mode        : 'raw',
            sendContent : xml,
            username    : userName,
            password    : apiKey
          });
        });
      });
    },

    paragraph: function (text) {
      if (!text) {
        return '';
      }
      return '<p>' + text.replace(/^\n*/, '').replace(/\n*$/, '').replace(/\n+/g, '</p><p>') + '</p>';
    },

    postEndpoint: function () {
      var self = this;
      return (self.BLOG_ADMIN_URL + 'atom/entry').replace(/^http:/, 'https:');
    },

    // @param data { userName, title, body, isDraft, categories }
    generateXML: function (data) {
      var categories = (data.categories || []).map(function (name) {
          return '<category term="' + escapeHTML(name) + '" />';
      }).join('');

      var template = '<?xml version="1.0" encoding="utf-8"?>' +
                     '<entry xmlns="http://www.w3.org/2005/Atom"' +
                            'xmlns:app="http://www.w3.org/2007/app">' +
                       '<title>%title%</title>' +
                       '<author><name>%userName%</name></author>' +
                       '<content type="text/plain">%body%</content>' +
                       categories +
                       '<app:control>' +
                         '<app:draft>%isDraft%</app:draft>' +
                       '</app:control>' +
                     '</entry>';

      return templateExtract(template, data);
    }
  });

  Models.register({
    name : 'Pinboard',
    ICON : 'https://pinboard.in/favicon.ico',
    LINK : 'https://pinboard.in/',

    check : function (ps) {
      return /photo|quote|link|conversation|video/.test(ps.type) && !ps.file;
    },

    getCurrentUser : function () {
      var that = this;
      return getCookies('pinboard.in', 'login').then(function (cookies) {
        var cookie = cookies[0];
        if (!cookie) {
          new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
        }
        return cookie.value;
      });
    },

    post : function (ps) {
      var that = this;
      return Promise.resolve().then(function () {
        return that.getCurrentUser().then(function () {
          return request('https://pinboard.in/add', {
            queryString : {
              title : ps.item,
              url   : ps.itemUrl,
            }
          });
        });
      }).then(function (res) {
        var form = formContents(res.responseText, true);
        var content = {
          title       : ps.item,
          url         : ps.itemUrl,
          description : joinText([ps.body, ps.description], ' ', true),
          tags        : joinText(ps.tags, ' '),
        };
        if (ps.private || form.private) {
          content.private = 'on';
        }
        return request('https://pinboard.in/add', {
          sendContent : update(form, content),
        });
      });
    },

    getUserTags : function () {
      return request('https://pinboard.in/user_tag_list/').then(function (res) {
        var tags = JSON.parse(res.responseText.replace(/^var\s+usertags\s*=\s*(\[.+\]);$/, '$1'));
        return tags.map(function (tag) {
          return {
            name: tag,
            frequency: 0
          };
        });
      });
    },

    getRecommendedTags : function (url) {
      return request('https://pinboard.in/ajax_suggest', {
        queryString : {
          url : url,
        }
      }).then(function (res) {
        // 空配列ではなく、空文字列が返ることがある
        return res.responseText?
          JSON.parse(res.responseText).map(function (tag) {
            // 数字のみのタグが数値型になるのを避ける
            return '' + tag;
          }) : [];
      });
    },

    getSuggestions : function (url) {
      var that = this;
      var ds = {
        tags        : this.getUserTags(),
        recommended : this.getRecommendedTags(url),
        suggestions : Promise.resolve().then(function () {
          return that.getCurrentUser().then(function () {
            return request('https://pinboard.in/add', {
              queryString : {
                url : url,
              }
            });
          });
        }).then(function (res) {
          var form = formContents(res.responseText);
          return {
            editPage : 'https://pinboard.in/add?url=' + url,
            form : {
              item        : form.title,
              description : form.description,
              tags        : form.tags.split(' '),
              private     : !!form.private,
            },

            // 入力の有無で簡易的に保存済みをチェックする
            // (submitボタンのラベルやalertの有無でも判定できる)
            duplicated : !!(form.tags || form.description),
          };
        })
      };

      return promiseAllHash(ds).then(function (table) {
        var res = table.suggestions;
        res.recommended = table.recommended;
        res.tags = table.tags;
        return res;
      });
    }
  });

  Models.register({
    name : 'Delicious',
    ICON : skin + 'delicious.png',
    LINK : 'https://delicious.com/',
    LOGIN_URL : 'https://secure.delicious.com/login',

    /**
     * ユーザーの利用しているタグ一覧を取得する。
     *
     * @param {String} user 対象ユーザー名。未指定の場合、ログインしているユーザー名が使われる。
     * @return {Array}
     */
    getUserTags : function (user) {
      return this.getCurrentUser(user).then(function (user) {
        // 同期でエラーが起きないようにする
        return defer().then(function () {
          return request('http://feeds.delicious.com/v2/json/tags/' + user, { responseType: 'json' });
        }).then(function (res) {
          var tags = res.response;
          if (!tags) {
            return tags;
          }
          return Object.keys(tags).reduce(function (memo, tag) {
            if (tag) {
              memo.push({
                name      : tag,
                frequency : tags[tag]
              });
            }
            return memo;
          }, []);
        });
      });
    },

    /**
     * タグ、おすすめタグ、ネットワークなどを取得する。
     * ブックマーク済みでも取得することができる。
     *
     * @param {String} url 関連情報を取得する対象のページURL。
     * @return {Object}
     */
    getSuggestions : function (url) {
      var that = this;
      var ds = {
        tags : this.getUserTags(),
        suggestions : this.getRecommendedTags(url)
      };
      return promiseAllHash(ds).then(function (table) {
        var res = table.suggestions;
        res.tags = table.tags;
        return res;
      }, function () {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
      });
    },

    getRecommendedTags: function (url) {
      return request('http://feeds.delicious.com/v2/json/urlinfo/' + SparkMD5.hash(url), { responseType: 'json' })
        .then(function (res) {
        var result = res.response;
        if (result.length) {
          var top_tags = result[0].top_tags;
          if (top_tags) {
            // get top_tags
            return {
              recommended : Object.keys(top_tags),
              duplicated : false,
            };
          }
        }
        return {
          recommended: [],
          duplicated: false
        };
      });
    },

    getCurrentUser : function (defaultUser) {
      if (defaultUser) {
        return Promise.resolve(defaultUser);
      }
      if (this.currentUser) {
        return Promise.resolve(this.currentUser);
      }
      var that = this;
      return this.getInfo().then(function (info) {
        if (!info.is_logged_in) {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
        }
        return info.logged_in_username;
      });
    },

    getInfo : function () {
      return request('http://previous.delicious.com/save/quick', {
          method : 'POST',
          responseType: 'json'
      }).then(function (res) { return res.response; });
    },

    check : function (ps) {
      return /photo|quote|link|conversation|video/.test(ps.type) && !ps.file;
    },

    transformForm: function (form) {
      var template = {
        'url': 'url',
        'oldUrl': 'oldUrl',
        'title': 'title',
        'tags': 'tags',
        'note': 'note',
        'stackId': 'stack_id',
        'private': 'private',
        'csrfToken': 'csrf_token'
      };
      var res = { };
      for (var key in form) {
        var target = template[key];
        if (target) {
          res[target] = form[key];
        }
      }
      return res;
    },

    post : function (ps) {
      var that = this;
      return this.getCurrentUser().then(function (user) {
        return request('http://previous.delicious.com/save', {
          queryString :  {
            url   : ps.itemUrl,
            title : ps.item
          },
          responseType: 'document'
        }).then(function (res) {
          var doc = res.response;
          return request('http://previous.delicious.com/save', {
            sendContent : that.transformForm(update(formContents(doc, true), {
              title       : ps.item,
              url         : ps.itemUrl,
              note        : joinText([ps.body, ps.description], ' ', true),
              tags        : joinText(ps.tags, ','),
              private     : !!ps.private
            }))
          });
        });
      });
    }
  });

  Models.register({
    name : 'Google',
    ICON : 'http://www.google.com/favicon.ico'
  });

  // copied from http://userscripts.org/scripts/show/19741
  Models.register({
    name : 'GoogleWebHistory',
    ICON : Models.Google.ICON,

    getCh : function (url) {
      function r(x,y) {
        return Math.floor((x/y-Math.floor(x/y))*y+0.1);
      }
      function m(c) {
        var i,j,s=[13,8,13,12,16,5,3,10,15];
        for (i=0;i<9;i+=1) {
          j=c[r(i+2,3)];
          c[r(i,3)] = (c[r(i,3)]-c[r(i+1,3)]-j)^(r(i,3)===1?j<<s[i]:j>>>s[i]);
        }
      }

      // update getCh
      this.getCh = function (url) {
        url='info:' + url;

        var c = [0x9E3779B9,0x9E3779B9,0xE6359A60],i,j,k=0,l,f=Math.floor;
        for (l=url.length ; l>=12 ; l-=12) {
          for (i=0 ; i<16 ; i+=1) {
            j=k+i;c[f(i/4)]+=url.charCodeAt(j)<<(r(j,4)*8);
          }
          m(c);
          k+=12;
        }
        c[2]+=url.length;

        for (i=l;i>0;i--) {
          c[f((i-1)/4)]+=url.charCodeAt(k+i-1)<<(r(i-1,4)+(i>8?1:0))*8;
        }
        m(c);

        return'6' + c[2];
      };

      return this.getCh(url);
    },

    post : function (url) {
      return request('http://www.google.com/search?client=navclient-auto&ch=' + this.getCh(url) + '&features=Rank&q=info:' + escape(url));
    }
  });

  Models.register({
    name : 'GoogleBookmarks',
    ICON : skin + 'google-bookmark.png',
    LINK : 'https://www.google.com/bookmarks/',
    LOGIN_URL : 'https://www.google.com/accounts/ServiceLogin',
    POST_URL : 'https://www.google.com/bookmarks/mark',

    check : function (ps) {
      return /photo|quote|link|conversation|video/.test(ps.type) && !ps.file;
    },

    post : function (ps) {
      var that = this;
      return request(this.POST_URL, {
        queryString :  {
          op : 'edit',
          output : 'popup'
        },
        responseType: 'document'
      }).then(function (res) {
        var doc = res.response;
        if (doc.getElementById('gaia_loginform')) {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
        }

        var form = $X('descendant::form[contains(concat(" ",normalize-space(@name)," ")," add_bkmk_form ")]', doc)[0];
        var fs = formContents(form);
        return request('https://www.google.com' + form.getAttribute('action'), {
          //denyRedirection: true,
          sendContent  : update(fs, {
            title      : ps.item,
            bkmk       : ps.itemUrl,
            annotation : joinText([ps.body, ps.description], ' ', true),
            labels     : ps.tags? ps.tags.join(',') : ''
          })
        });
      });
    },

    getEntry : function (url) {
      return request(this.POST_URL, {
        queryString : {
          op     : 'edit',
          output : 'popup',
          bkmk   : url
        },
        responseType: 'document'
      }).then(function (res) {
        var doc = res.response;
        var form = formContents(doc);
        return {
          saved       : (/(edit|編集)/i).test($X('//h1/text()', doc)[0]),
          item        : form.title,
          tags        : form.labels.split(/,/).map(function (label) { return label.trim(); }),
          description : form.annotation
        };
      });
    },

    getUserTags : function () {
      return request('https://www.google.com/bookmarks/mark', {
        queryString : {
          op : 'add'
        },
        responseType: 'document'
      }).then(function (res) {
        var doc = res.response;
        return doc.querySelectorAll('a[href^="/bookmarks/lookup?q=label:"]:not([href^="/bookmarks/lookup?q=label:%5Enone"])').reduce(function (memo, label) {
          memo.push({
            'name': label.firstChild.textContent.trim(),
            'frequency': label.firstElementChild.textContent.slice(1, -1)
          });
          return memo;
        }, []);
      });
    },


    getSuggestions : function (url) {
      var that = this;
      return promiseAllHash({
        tags  : this.getUserTags(),
        entry : this.getEntry(url)
      }).then(function (table) {
        var entry = table.entry;
        var tags = table.tags;
        return {
          form        : entry.saved? entry : null,
          tags        : tags,
          duplicated  : entry.saved,
          recommended : [],
          editPage    : that.POST_URL + '?' + queryString({
            op   : 'edit',
            bkmk : url
          })
        };
      }, function () {
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
      });
    }
  });

  Models.register({
    name: 'GoogleCalendar',
    ICON: 'https://calendar.google.com/googlecalendar/images/favicon.ico',
    LINK: 'https://www.google.com/calendar/',

    check: function (ps) {
      return /regular|link/.test(ps.type) && !ps.file;
    },

    getAuthCookie: function () {
      var that = this;
      return getCookies('www.google.com', 'secid').then(function (cookies) {
        if (cookies.length) {
          return cookies[cookies.length-1].value;
        } else {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
        }
      });
    },

    post: function (ps) {
      if (ps.item && (ps.itemUrl || ps.description)) {
        return this.addSchedule(
            ps.item, joinText([ps.itemUrl, ps.body, ps.description], '\n'), ps.date);
      } else {
        return this.addSimpleSchedule(ps.description);
      }
    },

    addSimpleSchedule: function (description) {
      return this.getAuthCookie().then(function (cookie) {
        var endpoint = 'http://www.google.com/calendar/m';
        return request(endpoint, {
          queryString : {
            hl : 'en'
          },
          responseType: 'document'
        }).then(function (res) {
          // form.secidはクッキー内のsecidとは異なる
          var doc = res.response;
          var form = formContents(doc);
          return request(endpoint, {
            redirectionLimit : 0,
            sendContent: {
              ctext  : description,
              secid  : form.secid,
              as_sdt : form.as_sdt
            }
          });
        });
      });
    },

    addSchedule: function (title, description, from, to) {
      var that = this;
      from = from || new Date();
      to = to || new Date(from.getTime() + (86400 * 1000));
      return this.getAuthCookie().then(function (cookie) {
        return request('http://www.google.com/calendar/event', {
            queryString : {
              action  : 'CREATE',
              secid   : cookie,
              dates   : that.createDateString(from) + '/' + that.createDateString(to),
              text    : title,
              details : description,
              sf      : true,
              crm     : 'AVAILABLE',
              icc     : 'DEFAULT',
              output  : 'js',
              scp     : 'ONE'
            }
        });
      });
    },

    createDateString: function (date) {
      var y = date.getFullYear().toString();
      var m = (date.getMonth() + 1).toString();
      if (m.length === 1) {
        m = '0' + m;
      }
      var d = date.getDate().toString();
      if (d.length === 1) {
        d = '0' + d;
      }
      return y + m + d;
    }
  });

  Models.register({
    name     : 'ChromeBookmark',
    ICON     : skin + 'chromium.ico',
    LINK     : 'chrome://bookmarks/',
    check : function (ps) {
      return ps.type === 'link';
    },
    post : function (ps) {
      return this.getExFolder().then(function (ex) {
        return new Promise(function (resolve) {
          chrome.bookmarks.create({
            parentId: ex.id,
            title   : ps.item,
            url     : ps.itemUrl
          }, resolve);
        });
      });
    },
    getExFolder: function () {
      return new Promise(function (resolve) {
        chrome.bookmarks.getTree(function (tree) {
          var top = tree[0].children[1];
          var ex;
          if (top.children.some(function (obj) {
            if (obj.title === 'TBRL') {
              ex = obj;
              return true;
            } else {
              return false;
            }
          })) {
            resolve(ex);
          } else {
            chrome.bookmarks.create({
              parentId: top.id,
              title   : 'TBRL'
            }, function (obj) {
              resolve(obj);
            });
          }
        });
      });
    }
  });

  Models.register({
    name     : 'Evernote',
    ICON     : 'https://www.evernote.com/favicon.ico',
    POST_URL : 'https://www.evernote.com/clip.action',
    LOGIN_URL: 'https://www.evernote.com/Login.action',
    LINK     : 'https://evernote.com/',

    check : function (ps) {
      return /regular|quote|link|conversation|video/.test(ps.type) && !ps.file;
    },

    post : function (ps) {
      var that = this;
      ps = update({}, ps);
      var d = Promise.resolve();
      if (ps.type==='link' && !ps.body && TBRL.Config['post']['evernote_clip_fullpage']) {
        // Because responseType: 'document' recognizes encoding
        d= request(ps.itemUrl, { responseType: 'document' }).then(function (res) {
          var doc = res.response;
          ps.body = convertToHTMLString(doc.documentElement, true);
        });
      }

      return d.then(function () {
        return that.getToken();// login checkも走る
      }).then(function (token) {
        return request(that.POST_URL, {
          redirectionLimit : 0,
          sendContent : update(token, {
            saveQuicknote : 'save',
            format        : 'microclip',

            url      : ps.itemUrl || 'no url',
            title    : ps.item || 'no title',
            comment  : ps.description,
            body     : getFlavor(ps, 'html'),
            tags     : joinText(ps.tags, ','),
            fullPage : (ps.body)? 'true' : 'false'
          })
        });
      });
    },

    getToken : function () {
      var that = this;
      return request(this.POST_URL, {
        sendContent: {
          format    : 'microclip',
          quicknote : 'true'
        },
        responseType: 'document'
      }).then(function (res) {
        var doc = res.response;
        if ($X('id("login_form")', doc)[0]) {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
        }

        return {
          _sourcePage   : $X('//input[@name="_sourcePage"]/@value', doc)[0],
          __fp          : $X('//input[@name="__fp"]/@value', doc)[0],
          noteBookGuide : $X('//select[@name="notebookGuid"]//option[@selected="selected"]/@value', doc)[0]
        };
      });
    }
  });

  Models.register({
    name : 'FriendFeed',
    ICON : 'https://friendfeed.com/favicon.ico',
    LINK : 'https://friendfeed.com/',
    LOGIN_URL : 'https://friendfeed.com/account/login',
    check : function (ps) {
      return (/photo|quote|link|conversation|video/).test(ps.type) && !ps.file;
    },

    getToken : function () {
      var self = this;
      return request('http://friendfeed.com/share/bookmarklet/frame', { responseType: 'document' })
      .then(function (res) {
        var doc = res.response;
        if ($X('descendant::span[child::a[@href="http://friendfeed.com/account/login"]]', doc)[0]) {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
        }
        return $X('descendant::input[contains(concat(" ",normalize-space(@name)," ")," at ")]/@value', doc)[0];
      });
    },

    post : function (ps) {
      return this.getToken().then(function (token) {
        return request('https://friendfeed.com/a/bookmarklet', {
          //denyRedirection: true,
          sendContent : {
            at      : token,
            link    : ps.pageUrl,
            title   : ps.page,
            image0  : ps.type === 'photo'? ps.itemUrl : '',
            comment : joinText([ps.body, ps.description], ' ', true)
          }
        });
      });
    }
  });

  Models.register({
    name : 'Twitter',
    ICON : 'https://twitter.com/favicon.ico',
    URL  : 'https://twitter.com',
    LINK : 'https://twitter.com/',
    LOGIN_URL : 'https://twitter.com/login',
    SHORTEN_SERVICE : 'bit.ly',

    check : function (ps) {
      return /regular|photo|quote|link|conversation|video/.test(ps.type);
    },

    createStatus : function (ps) {
      var self     = this;
      var template = TBRL.Config['entry']['twitter_template'];
      var status   = '';
      var maxlen   = 140;
      if (ps.type === 'photo') {
        ps = update({}, ps);
        ps.itemUrl = ps.pageUrl;
        maxlen -= 23; // reserve for pic.twitter.com
      }
      if (!template) {
        status = joinText([ps.description, (ps.body)? '"' + ps.body + '"' : '', ps.item, ps.itemUrl], ' ');
      } else {
        status = templateExtract(template,{
          description   : ps.description,
          description_q : (ps.description) ? '"' + ps.description + '"' : null,
          body          : ps.body,
          body_q        : (ps.body) ? '"' + ps.body + '"' : null,
          title         : ps.item,
          title_q       : (ps.item) ? '"' + ps.item + '"' : null,
          link          : ps.itemUrl,
          link_q        : (ps.itemUrl) ? '"' + ps.itemUrl + '"' : null
        });
      }
      return (TBRL.Config['post']['always_shorten_url'] ?
          shortenUrls(status, Models[self.SHORTEN_SERVICE]) : Promise.resolve(status)).then(function (status) {
        var len = self.getActualLength(status);
        if (len > maxlen) {
          throw new Error('too many characters to post (' + (len - maxlen) + ' over)');
        }
        return status;
      });
    },

    post : function (ps) {
      var self = this;
      return this.createStatus(ps).then(function (status) {
        if (ps.type === 'photo') {
          return self.download(ps).then(function (file) {
            return self.upload(ps, status, file);
          });
        }
        return self.update(status);
      });
    },

    update : function (status, media_ids) {
      var self = this;
      return this.getToken().then(function (token) {
        var sendContent = {
          authenticity_token : token.authenticity_token,
          place_id           : '',
          status             : status,
          tagged_users       : ''
        };

        if (media_ids) {
          sendContent.media_ids = media_ids;
        }

        // FIXME: 403が発生することがあったため redirectionLimit:0 を外す
        return request(self.URL + '/i/tweet/create', {
          sendContent : sendContent,
          responseType: 'json'
        }).catch(function (e) {
          var res = e.message;
          var json = res.response;
          throw new Error(json.message);
        });
      });
    },

    favor : function (ps) {
      return this.addFavorite(ps.favorite.id);
    },

    getToken : function () {
      var self = this;
      return request(this.URL + '/settings/account').then(function (res) {
        var html = res.responseText;
        if (~html.indexOf('class="signin"')) {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
        }

        return {
          authenticity_token : html.extract(/authenticity_token.+value="(.+?)"/),
          siv                : html.extract(/logout\?siv=(.+?)"/)
        };
      });
    },

    remove : function (id) {
      var self = this;
      return this.getToken().then(function (ps) {
        ps._method = 'delete';
        return request(self.URL + '/status/destroy/' + id, {
          //denyRedirection: true,
          referrer : self.URL + '/',
          sendContent : ps
        });
      });
    },

    addFavorite : function (id) {
      var self = this;
      return this.getToken().then(function (ps) {
        return request(self.URL + '/favourings/create/' + id, {
          //denyRedirection: true,
          referrer : self.URL + '/',
          sendContent : ps
        });
      });
    },

    getRecipients : function () {
      return request(this.URL + '/direct_messages/recipients_list?twttr=true').then(function (res) {
        return map(function (pair) {
          return {id:pair[0], name:pair[1]};
        }, JSON.parse('(' + res.responseText + ')'));
      });
    },

    download : function (ps) {
      return (
        ps.file ? Promise.resolve(ps.file)
          : download(ps.itemUrl).then(function (entry) {
            return getFileFromEntry(entry);
          })
      );
    },

    upload : function (ps, status, file) {
      var self = this;
      var UPLOAD_URL = 'https://upload.twitter.com/i/media/upload.iframe';

      return this.getToken().then(function (token) {
        return fileToBinaryString(file).then(function (binary) {
          return request(UPLOAD_URL, {
            queryString : {
              origin : self.URL
            },
            sendContent : {
              authenticity_token : token.authenticity_token,
              iframe_callback    : '',
              media              : window.btoa(binary),
              upload_id          : (new Date()).getTime(),
              origin             : self.URL
            }
          }).then(function (res) {
            var html = res.responseText;
            var json = html.extract(/parent\.postMessage\(JSON\.stringify\((\{.+\})\), ".+"\);/);
            json = JSON.parse(json);
            return self.update(status, json.media_id_string);
         });
        });
      });
    },

    getActualLength : function (status) {
      var ret = status.split('\n').map(function (s) {
        s = s.replace(/(https:\/\/[^ ]+)/g, '12345678901234567890123');
        s = s.replace(/(http:\/\/[^ ]+)/g, '1234567890123456789012');
        return s;
      }).join('\n');
      return ret.length;
    }
  });

  Models.register({
    name : 'Instapaper',
    ICON : skin + 'instapaper.png',
    LINK : 'https://www.instapaper.com/',
    POST_URL: 'http://www.instapaper.com/edit',
    LOGIN_URL : 'https://www.instapaper.com/user/login',
    check : function (ps) {
      return /quote|link/.test(ps.type);
    },
    post : function (ps) {
      var url = this.POST_URL;
      var self = this;
      return request(url, { responseType: 'document' }).then(function (res) {
        var doc = res.response;
        if (!$X('id("userpanel")/a[contains(concat(" ",normalize-space(@href)," "), " /user/logout ")]', doc)[0]) {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
        }
        return $X('//input[@id="form_key"]/@value', doc)[0];
      }).then(function (token) {
        return request(url, {
          //denyRedirection: true,
          sendContent: {
            'form_key': token,
            'bookmark[url]': ps.itemUrl,
            'bookmark[title]': ps.item,
            'bookmark[selection]': joinText([ps.body, ps.description])
          }
        });
      });
    }
  });

  Models.register({
    name : 'Pocket',
    ICON : 'https://getpocket.com/favicon.ico',
    LINK : 'https://getpocket.com/',
    LOGIN_URL : 'https://getpocket.com/l',
    check : function (ps) {
      return /quote|link/.test(ps.type);
    },
    post : function (ps) {
      var that = this;
      return this.checkLogin().then(function () {
        return request(that.LINK + 'edit', {
          responseType : 'document',
          queryString : {
            tags  : ps.tags ? ps.tags.join(',') : '',
            url   : ps.itemUrl
          }
        }).then(function (res) {
          var doc = res.response;
          if (doc.body.classList.contains('page-login')) {
            throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
          }
        });
      });
    },
    checkLogin : function () {
      var that = this;
      return getCookies('.getpocket.com', 'sess_user_id').then(function (cookies) {
        if (!cookies.length) {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
        }
      });
    }
  });

  // http://developer.yahoo.co.jp/jlp/MAService/V1/parse.html
  // APP_ID => Taberareloo ID
  Models.register({
    name : 'Yahoo',
    APP_ID : 'KaZybVOxg67G6sNQLuSMqenqXLGGIbfVJGCWgHrPWGMlQS5BGWIgAVcueAxAByQBatwmBYewBgEs3.3y',
    /* jshint ignore:start */
    // 冗長な表記を許すcode map
    // 配列の許容 配列は優先度が高いものを先頭に
    katakana: {
      'ウァ':'wha','ウィ':'wi','ウェ':'we','ウォ':'who',
      'キャ':'kya','キィ':'kyi','キュ':'kyu','キェ':'kye','キョ':'kyo',
      'クャ':'qya','クュ':'qyu',
      'クァ':'qwa','クィ':'qwi','クゥ':'qwu','クェ':'qwe','クォ':'qwo',
      'ギャ':'gya','ギィ':'gyi','ギュ':'gyu','ギェ':'gye','ギョ':'gyo',
      'グァ':'gwa','グィ':'gwi','グゥ':'gwu','グェ':'gwe','グォ':'gwo',
      'シャ':['sha','sha','sya'],'シィ':'syi','シュ':['shu','syu'],'シェ':['sye','she'],'ショ':['sho','sho'],
      'スァ':'swa','スィ':'swi','スゥ':'swu','スェ':'swe','スォ':'swo',
      'ジャ':['ja','zya'],'ジィ':['jyi','zyi'],'ジュ':['ju','zyu'],'ジェ':['je','zye','jye'],'ジョ':['zyo','jo'],
      'チャ':'cha','チィ':'tyi','チュ':'chu','チェ':'tye','チョ':'cho',
      'ツァ':'tsa','ツィ':'tsi','ツェ':'tse','ツォ':'tso',
      'テャ':'tha','ティ':'thi','テュ':'thu','テェ':'the','テョ':'tho',
      'トァ':'twa','トィ':'twi','トゥ':'twu','トェ':'twe','トォ':'two',
      'ヂャ':'dya','ヂィ':'dyi','ヂュ':'dyu','ヂェ':'dye','ヂョ':'dyo',
      'デャ':'dha','ディ':'dhi','デュ':'dhu','デェ':'dhe','デョ':'dho',
      'ドァ':'dwa','ドィ':'dwi','ドゥ':'dwu','ドェ':'dwe','ドォ':'dwo',
      'ニャ':'nya','ニィ':'nyi','ニュ':'nyu','ニェ':'nye','ニョ':'nyo',
      'ヒャ':'hya','ヒィ':'hyi','ヒュ':'hyu','ヒェ':'hye','ヒョ':'hyo',
      'フャ':'fya','フュ':'fyu','フョ':'fyo',
      'ファ':'fa','フィ':'fi','フゥ':'fwu','フェ':'fe','フォ':'fo',
      'ビャ':'bya','ビィ':'byi','ビュ':'byu','ビェ':'bye','ビョ':'byo',
      'ヴァ':'va','ヴィ':'vi','ヴ':'vu','ヴェ':'ve','ヴォ':'vo',
      'ヴャ':'vya','ヴュ':'vyu','ヴョ':'vyo',
      'ピャ':'pya','ピィ':'pyi','ピュ':'pyu','ピェ':'pye','ピョ':'pyo',
      'ミャ':'mya','ミィ':'myi','ミュ':'myu','ミェ':'mye','ミョ':'myo',
      'リャ':'rya','リィ':'ryi','リュ':'ryu','リェ':'rye','リョ':'ryo',

      'ア':'a','イ':'i','ウ':'u','エ':'e','オ':'o',
      'カ':'ka','キ':'ki','ク':'ku','ケ':'ke','コ':'ko',
      'サ':'sa','シ':['shi','si'],'ス':'su','セ':'se','ソ':'so',
      'タ':'ta','チ':['chi','ti'],'ツ':['tsu','tu'],'テ':'te','ト':'to',
      'ナ':'na','ニ':'ni','ヌ':'nu','ネ':'ne','ノ':'no',
      'ハ':'ha','ヒ':'hi','フ':'fu','ヘ':'he','ホ':'ho',
      'マ':'ma','ミ':'mi','ム':'mu','メ':'me','モ':'mo',
      'ヤ':'ya','ユ':'yu','ヨ':'yo',
      'ラ':'ra','リ':'ri','ル':'ru','レ':'re','ロ':'ro',
      'ワ':'wa','ヲ':'wo','ン':'nn',
      'ガ':'ga','ギ':'gi','グ':'gu','ゲ':'ge','ゴ':'go',
      'ザ':'za','ジ':['ji','zi'],'ズ':'zu','ゼ':'ze','ゾ':'zo',
      'ダ':'da','ヂ':'di','ヅ':'du','デ':'de','ド':'do',
      'バ':'ba','ビ':'bi','ブ':'bu','ベ':'be','ボ':'bo',
      'パ':'pa','ピ':'pi','プ':'pu','ペ':'pe','ポ':'po',

      'ァ':'la','ィ':'li','ゥ':'lu','ェ':'le','ォ':'lo',
      'ヵ':'lka','ヶ':'lke','ッ':'ltu',
      'ャ':'lya','ュ':'lyu','ョ':'lyo','ヮ':'lwa',
      '。':'.','、':',','ー':'-'
    },
    /* jshint ignore:end */
    lengthMap: {},

    parse : function (ps) {
      ps.appid = this.APP_ID;
      return request('http://jlp.yahooapis.jp/MAService/V1/parse', {
        charset     : 'application/xml; charset=utf-8',
        sendContent : ps
      }).then(function (res) {
        return res.responseXML;
      });
    },

    getKanaReadings : function (str) {
      return this.parse({
        sentence : str,
        response : 'reading'
      }).then(function (res) {
        return $X('descendant::reading/text()', res);
      });
    },

    getRomaReadings : function (str) {
      return this.getKanaReadings(str).then(function (rs) {
        return rs.join('\u0000').toRoma().split('\u0000');
      });
    },

    // experimental
    // tag取得専用なのでstrで返却しません
    // 同一の読み仮名に対して複数のpatternを許容する
    // 重たくなるかも? なる、なの :おまひま
    getSparseTags : function (tags, str, delimiter) {
      if (!delimiter) {
        delimiter = ' [';
      }
      var self = this;
      return this.getKanaReadings(str).then(function (rs) {
        var katakana = rs.join('').split(' [').join('\u0000').toKatakana();
        var katakanas = katakana.split('\u0000');
        return arrayZip(self.toSparseRomaReadings(katakana), tags).map(function (pair, index) {
          var reading = pair[0], tag = pair[1];
          // 再計算flagがたっているか. 分岐考慮型計算は時間食うのでできるだけしない.
          if (~reading.indexOf('\u0001')) {
            var res = {
              readings: self.duplicateRomaReadings(katakanas[index]),
              value: tag
            };
            return res;
          } else {
            return {
              value: tag,
              reading: reading
            };
          }
        });
      });
    },

    duplicateRomaReadings : function (s) {
      // 分岐件数依存で一定数(この場合20)以上になるようであれば打ち切る(Tombloo標準の優先文字を使う)
      // 分岐件数が「ジェジェジェジェジェジェジェジェジェジェジェ」などになると天文学的になるのに対する対応
      // abbreviation scorerが後になるほど評価対象として低いので, 結果に影響が出ない
      var stack = [];
      var count = 1;
      for (var i = 0, roma, kana, table = this.katakana ; i < s.length ; i += kana.length) {
        kana = s.substring(i, i + 2);
        roma = table[kana];

        if (!roma) {
          kana = s.substring(i, i + 1);
          roma = table[kana] || kana;
        }

        var len = this.lengthMap[kana];
        if (len) {
          var r = count * len;
          if (r > 20) {
            stack.push(roma[0]);
          } else {
            count = r;
            stack.push(roma);
          }
        } else {
          stack.push(roma);
        }
      }
      return this.stackWalker(stack).map(function (l) { return l.join(''); });
    },

    stackWalker: function (stack) {
      var res = [];
      var last_num = stack.length;
      function walker(current, current_num) {
        var next = current_num + 1;
        var elements = stack[current_num];
        var returnee = res[current_num];
        if (Array.isArray(elements)) {
          for (var i = 0, len = elements.length; i < len; ++i) {
            var element = elements[i];
            var d = $A(current);
            d.push(element);
            returnee.push(d);
            if (next !== last_num) {
              walker(d, next);
            }
          }
        } else {
          // 一つしかないときはcloneする必要がない
          current.push(elements);
          returnee.push(current);
          if (next !== last_num) {
            walker(current, next);
          }
        }
      }
      for (var i = 0; i < last_num; ++i) {
        res[i] = [];
      }
      walker([], 0);
      return res[last_num - 1];
    },

    toSparseRomaReadings: function (s) {
      var res = [];
      for (var i = 0, roma, kana, table = this.katakana, len = s.length; i < len; i += kana.length) {
        kana = s.substring(i, i + 2);
        roma = table[kana];

        if (!roma) {
          kana = s.substring(i, i + 1);
          roma = table[kana] || kana;
        }

        if (kana in this.lengthMap) {
          roma = '\u0001';// contains flag
        }

        res.push(roma);
      }
      return res.join('').replace(/ltu(.)/g, '$1$1').split('\u0000');
    }

  });
  items(Models.Yahoo.katakana).forEach(function (pair) {
    var val = pair[1];
    if (Array.isArray(val)) {
      Models.Yahoo.lengthMap[pair[0]] = val.length;
    }
  });

  Models.register({
    name : 'YahooBookmarks',
    ICON : 'http://i.yimg.jp/images/sicons/ybm16.gif',
    LINK : 'http://bookmarks.yahoo.co.jp/',
    LOGIN_URL : 'https://login.yahoo.co.jp/config/login?.src=bmk2',

    check : function (ps) {
      return (/photo|quote|link|conversation|video/).test(ps.type) && !ps.file;
    },

    post : function (ps) {
      var self = this;
      return request('http://bookmarks.yahoo.co.jp/action/post').then(function (res) {
        if (res.responseText.indexOf('login_form') !== -1) {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
        }

        var doc = createHTML(res.responseText);
        return formContents($X('id("addbookmark")/descendant::div[contains(concat(" ",normalize-space(@class)," ")," bd ")]', doc)[0]);
      }).then(function (fs) {
        return request('http://bookmarks.yahoo.co.jp/action/post/done', {
          //denyRedirection: true,
          sendContent  : {
            title      : ps.item,
            url        : ps.itemUrl,
            desc       : joinText([ps.body, ps.description], ' ', true),
            tags       : ps.tags ? ps.tags.join(' ') : '',
            crumbs     : fs.crumbs,
            visibility : ps.private === null ? fs.visibility : (ps.private ? 0 : 1)
          }
        });
      });
    },

    /**
     * タグ、おすすめタグを取得する。
     * ブックマーク済みでも取得することができる。
     *
     * @param {String} url 関連情報を取得する対象のページURL。
     * @return {Object}
     */
    getSuggestions : function (url) {
      var self = this;
      return request('http://bookmarks.yahoo.co.jp/bookmarklet/showpopup', {
        queryString : {
          u : url
        }
      }).then(function (res) {
        var doc = createHTML(res.responseText);
        if (!$X('id("bmtsave")', doc)[0]) {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
        }

        function getTags(part) {
          try {
            return JSON.parse(unescapeHTML(res.responseText.extract(new RegExp('^' + part + ' ?= ?(.+);$', 'm'), 1))) || [];
          } catch (e) {
            return [];
          }
        }

        return {
          duplicated : !!$X('//input[@name="docid"]', doc)[0],
          popular : getTags('rectags'),
          tags : getTags('yourtags').map(function (tag) {
            return {
              name      : tag,
              frequency : -1
            };
          })
        };
      });
    }
  });

  Models.register({
    name : 'gist',
    ICON : 'https://gist.github.com/favicon.ico',
    LINK : 'https://gist.github.com/',
    LOGIN_URL : 'https://gist.github.com/login',
    URL  : 'https://gist.github.com/',
    check: function (ps) {
      return (/regular|quote/).test(ps.type);
    },
    post : function (ps) {
      var self = this;
      return request(this.URL, { responseType: 'document' }).then(function (res) {
        var doc = res.response;
        var token = doc.querySelector('input[name="authenticity_token"]');
        if (!($X('descendant::div[contains(concat(" ",normalize-space(@class)," ")," header-logged-in ")]', doc)[0] && token)) {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
        }
        var form = formContents($X('descendant::form[@action="/gists"]', doc)[0]);
        var content;
        switch (ps.type) {
        case 'regular':
          content = ps.description;
          break;
        case 'quote':
          content = joinText([ps.body, '', ps.itemUrl, '', ps.description], '\n\n');
          break;
        }
        form['gist[files][][content]'] = content;
        form['gist[description]'] = ps.item;
        // public
        form['gist[public]'] = '1';
        form['authenticity_token'] = token.value;
        return request(self.URL + 'gists', {
          sendContent: form
        });
      });
    }
  });

  Models.register({
    name     : 'PickNaver',
    ICON     : skin + 'pick-naver.png',
    LINK     : 'http://pick.naver.jp/',
    LOGIN_URL: 'https://ssl.naver.jp/login?fromUrl=http://pick.naver.jp/',

    POST_URL : 'http://pick.naver.jp/api/html/post/mainboard',

    SHORTEN_SERVICE : 'bit.ly',

    check : function (ps) {
      return (/(regular|photo|quote|link|video)/).test(ps.type) && !ps.file;
    },

    getAuthCookie: function () {
      var that = this;
      return getCookies('.naver.jp', 'NJID_AUT').then(function (cookies) {
        if (cookies.length) {
          return cookies[cookies.length - 1].value;
        }
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
      });
    },

    post : function (ps) {
      var self = this;
      return this.getAuthCookie().then(function (ok) {
        var status = joinText([
            ps.description,
            ps.type === 'photo' ? ps.page : '',
            ps.type === 'photo' ? ps.pageUrl : '',
            ps.body ? '“' + ps.body + '”' : ''
          ], '\n', true);
        return self.update(status, ps);
      });
    },

    update : function (status, ps) {
      var self = this;
      return Promise.resolve(
        (status.length < 300 && !TBRL.Config['post']['always_shorten_url']) ? status : shortenUrls(status, Models[this.SHORTEN_SERVICE])
      ).then(function (status) {
        var typeCode = 'T';
        var media = {};
        if (ps.type === 'photo') {
          typeCode = 'I';
          media.mediaUrl = ps.itemUrl;
          media.mediaThumbnailUrl = ps.itemUrl;
        } else if (ps.type !== 'regular') {
          typeCode = 'U';
          media.mediaUrl = ps.itemUrl || ps.pageUrl;
        }

        return request(self.POST_URL, {
          method : 'POST',
          headers : {
            'Content-Type' : 'application/json; charset=utf-8'
          },
          sendContent : JSON.stringify({
            serviceTypeCode: 'P',
            refererTypeCode: 'W',
            typeCode       : typeCode,
            postText       : status,
            urlTitle       : ps.item || ps.page,
            boardType      : 'mainboard',
            media          : media,
            pointedUser    : [],
            group          : {'groupId': 0},
            rnd            : new Date().getTime()
          })
        });
      });
    }
  });

  Models.register({
    name: 'Diigo',
    ICON: 'https://www.diigo.com/favicon.ico',
    LINK: 'https://www.diigo.com/',
    UPLOAD_URL: 'http://www.diigo.com/item/save/image', // based on http://www.diigo.com/item/new/image?t=basic

    check: function (ps) {
      return (/photo|quote|link|conversation|video/).test(ps.type);
    },

    post: function (ps) {
      if (ps.file) {
        return this.uploadImage(ps);
      }
      return this.addBookmark(ps.itemUrl, ps.item, ps.tags, joinText([ps.body, ps.description], ' '), ps.private);
    },

    uploadImage: function (ps) {
      return request(this.UPLOAD_URL, {
        sendContent: {
          file1       : ps.file,
          description : joinText([
            ps.description,
            '(via ' + ps.pageUrl + ' )'
          ], '\n', true),
          tags        : (ps.tags && ps.tags.length) ? joinText(ps.tags, ',') : '',
          private     : (!!ps.private ? 'on' : '')
        }
      });
    },

    addBookmark: function (url, title, tags, description, priv) {
      var that = this;
      return request('http://www.diigo.com/item/new/bookmark', { responseType: 'document' }).then(function (res) {
        var doc = res.response;
        var element = doc.getElementById('newBookmarkForm');
        if (!element) {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
        }
        var form = formContents(element);
        return request('http://www.diigo.com/item/save/bookmark', {
          sendContent: update(form, {
            url: url,
            title: title,
            tags: tags.join(' '),
            description: description,
            private: priv
          })
        });
      });
    }
  });

  // http://www.kawa.net/works/ajax/romanize/japanese.html
  Models.register({
    name : 'Kawa',

    getRomaReadings : function (text) {
      return request('http://www.kawa.net/works/ajax/romanize/romanize.cgi', {
        queryString : {
          // mecab-utf8
          // japanese
          // kana
          mode : 'japanese',
          q : text
        }
      }).then(function (res) {
        /*
        return map(function (s) {
          return '' + s.@title || '' + s;
        }, createXML(res.responseText).li.span);
        */
      });
    }
  });

  Models.register({
    name : 'is.gd',
    ICON : 'http://is.gd/favicon.ico',
    URL  : 'http://is.gd/',

    shorten : function (url) {
      if (/\/\/is\.gd\//.test(url)) {
        return Promise.resolve(url);
      }

      return request(this.URL + '/api.php', {
        //denyRedirection: true,
        queryString : {
          longurl : url
        }
      }).then(function (res) {
        return res.responseText;
      });
    },

    expand : function (url) {
      return request(url, {
        //denyRedirection : true
      }).then(function (res) {
        return res.channel.URI.spec;
      });
    }
  });

  Models.register({
    name    : 'bit.ly',
    ICON    : 'http://bit.ly/static/images/favicon.png',
    URL     : 'http://api.bitly.com/v3',
    API_KEY : 'R_8d078b93e8213f98c239718ced551fad',
    USER    : 'to',
    VERSION : '3.0.0',

    shorten : function (url) {
      if (/\/\/(?:bit\.ly|j\.mp)/.test(url)) {
        return Promise.resolve(url);
      }

      return this.callMethod('shorten', {
        longUrl : url
      }).then(function (res) {
        return res.url;
      });
    },

    expand : function (url) {
      var hash = url.split('/').pop();
      return this.callMethod('expand', {
        hash : hash,
        shortUrl : url
      }).then(function (res) {
        return res['expand'][0].long_url;
      });
    },

    callMethod : function (method, ps) {
      return request(this.URL + '/' + method, {
        queryString : update({
          login   : this.USER,
          apiKey  : this.API_KEY,
          format  : 'json'
        }, ps),
        responseType: 'json'
      }).then(function (res) {
        res = res.response;
        if (!res || res.status_code !== 200) {
          var error = new Error([res.status_code, res.status_txt].join(': '));
          error.detail = res;
          throw error;
        }

        return res.data;
      });
    }
  });

  Models.register(update({}, Models['bit.ly'], {
    name: 'j.mp',
    ICON: 'http://j.mp/static/images/favicon.png',
    URL : 'http://api.j.mp'
  }));

  Models.register({
    name       : 'Gmail',
    ICON       : skin + 'gmail.ico',
    LINK       : 'https://mail.google.com/mail/',
    LOGIN_URL  : 'https://accounts.google.com/ServiceLogin?service=mail',

    HOME_URL   : 'https://mail.google.com/mail/u/0/',

    GLOBALS_REGEX : /<script\b[^>]*>(?:\/\/\s*<!\[CDATA\[)?\s*\bvar\s+GLOBALS\s*=\s*([[]+(?:(?:(?![\]]\s*;\s*GLOBALS\[0\]\s*=\s*GM_START_TIME\s*;)[\s\S])*)*[\]])\s*;\s*GLOBALS\[0\]\s*=\s*GM_START_TIME\s*;/i,

    check: function (ps) {
      return (/regular|photo|quote|link|video/).test(ps.type);
    },

    getAuthCookie: function () {
      var self = this;
      return getCookies('.google.com', 'SSID').then(function (cookies) {
        if (cookies.length) {
          return cookies[cookies.length - 1].value;
        }
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      });
    },

    getGmailAt : function () {
      return getCookies('mail.google.com', 'GMAIL_AT').then(function (cookies) {
        if (cookies.length) {
          return cookies[cookies.length - 1].value;
        }
        return '';
      });
    },

    getGLOBALS : function () {
      var self = this;
      return request(self.HOME_URL).then(function (res) {
        var GLOBALS = res.responseText.match(self.GLOBALS_REGEX)[1];
        return Sandbox.evalJSON(GLOBALS).then(function (json) {
          return json;
        });
      });
    },

    post : function (ps) {
      var self = this;
      ps = update({}, ps);
      return self.getAuthCookie().then(function (cookie) {
        return self.getGLOBALS().then(function (GLOBALS) {
          if (ps.type === 'photo') {
            return self.download(ps).then(function (file) {
              ps.file = file;
              return self._post(GLOBALS, ps);
            });
          } else {
            return self._post(GLOBALS, ps);
          }
        });
      });
    },

    now : Date.now,

    SEQUENCE1 : 0,

    getRid : function (GLOBALS) {
      this.SEQUENCE1 += 2;
      return 'mail:sd.' + GLOBALS[28] + '.' + this.SEQUENCE1 + '.0';
    },

    getJsid : function () {
      return Math.floor(2147483648 * Math.random()).toString(36) +
        Math.abs(Math.floor(2147483648 * Math.random()) ^ 1).toString(36);
    },

    SEQUENCE2 : 1,

    getCmid : function () {
      return this.SEQUENCE2++;
    },

    SEQUENCE3 : 0,

    getReqid : function () {
      var now = new Date();
      this.seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      return this.seconds + (this.SEQUENCE3++) * 1E5;
    },

    SEQUENCE4 : 0,

    getFileid : function () {
      return 'f_' + this.now().toString(36) + this.SEQUENCE4++;
    },

    download : function (ps) {
      if (ps.file) {
        return Promise.resolve(ps.file);
      }
      return download(ps.itemUrl, getFileExtension(ps.itemUrl))
        .then(function (entry) {
          return getFileFromEntry(entry);
        })
        .catch(function (e) {
          throw new Error('Could not get an image file.');
        });
    },

    createContents : function (ps) {
      var description = '';
      if (ps.description) {
        description += '<p>' + ps.description.replace(/\n/g, '<br/>\n') + '</p>\n\n';
      }
      if (ps.page && ps.pageUrl) {
        description += '<a href="' + ps.pageUrl + '">' + ps.page + '</a>\n';
      }
      else if (ps.pageUrl) {
        description += '<a href="' + ps.pageUrl + '">' + ps.pageUrl + '</a>\n';
      }
      if (ps.body) {
        description += '<blockquote>' + getFlavor(ps, 'html') + '</blockquote>';
      }
      return description;
    },

    createRecipients : function (GLOBALS) {
      var addr = GLOBALS[10].split('@');
      return '<' + addr[0] + '+taberareloo@' + addr[1] + '>, ';
    },

    _post : function (GLOBALS, ps) {
      var self = this;

      var content = self.createContents(ps);

      var sc = {
        to      : self.createRecipients(GLOBALS),
        cc      : '',
        bcc     : '',
        subject : ps.item || ps.page,
        body    : content,
        ishtml  : 1,
        nowrap  : 0,
        draft   : 'undefined',
        bwd     : '',
        rm      : 'undefined',
        cans    : '',
        ctok    : '',
        ac      : '[]',
        adc     : ''
      };

      return self.getGmailAt().then(function (at) {
        var qs = {
          ui     : 2,
          ik     : GLOBALS[9],
          rid    : self.getRid(GLOBALS),
          at     : at,
          view   : 'up',
          act    : 'sm',
          jsid   : self.getJsid(),
          cmid   : self.getCmid(),
          cmeb   : 1, // 0, ???
          cmml   : content.length,
          _reqid : self.getReqid(),
          pcd    : 1,
          mb     : 0,
          rt     : 'c'
        };

        if ((ps.type === 'photo') && ps.file) {
          sc[self.getFileid()] = ps.file;
          qs['rt'] = 'h';
          qs['zx'] = self.getJsid();
        }

        return request(self.HOME_URL + '?' + queryString(qs), {
          sendContent : sc
        });
      });
    }
  });

  var WebHook = exports.WebHook = {
    name      : 'WebHook',
    ICON      : skin + 'webhook.png',
    LINK      : 'http://www.webhooks.org/',
    LOGIN_URL : null,

    POST_URL  : null,

    check : function (ps) {
      return true;
    },

    post : function (ps) {
      var self = this;
      ps = update({}, ps);
      if (ps.type === 'photo') {
        return self._download(ps).then(function (file) {
          ps.file = file;
          return fileToBinaryString(file).then(function (binary) {
            ps.file = window.btoa(binary);
            return self._post(ps);
          });
        });
      } else {
        return self._post(ps);
      }
    },

    _post : function (ps) {
      var self = this;

      var sendContent = {
        type  : ps.type,
        title : ps.item || ps.page,
        url   : ps.pageUrl,
        body  : ps.body,
        html  : getFlavor(ps, 'html'),
        desc  : ps.description || null,
        item  : ps.itemUrl,
        file  : ps.file || null
      };

      return request(self.POST_URL, {
        sendContent : sendContent
      });
    },

    _download : function (ps) {
      if (ps.file) {
        return Promise.resolve(ps.file);
      }
      return download(ps.itemUrl, getFileExtension(ps.itemUrl)).then(function (entry) {
        return getFileFromEntry(entry);
      });
    }
  };

  Models.register({
    name      : 'Pinterest',
    ICON      : 'http://passets-cdn.pinterest.com/images/favicon.png',
    LINK      : 'http://www.pinterest.com/',
    LOGIN_URL : 'https://www.pinterest.com/login/',

    BOOKMARK_URL : 'http://www.pinterest.com/pin/create/bookmarklet/',
    UPLOAD_URL   : 'http://www.pinterest.com/pin/create/',

    is_new_api   : false,
    POST_URL_2   : 'http://www.pinterest.com/resource/PinResource/create/',
    UPLOAD_URL_2 : 'http://www.pinterest.com/upload-image/',

    timer : null,

    initialize : function () {
      var self = this;

      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }

      var enable = false;
      ['photo'].forEach(function (type) {
        var config = Models.getConfig({ type: type }, self);
        if ((config === 'default') || (config === 'enabled')) {
          enable = true;
        }
      });

      if (!enable) {
        return;
      }

      try {
        this._getBoards();
      }
      catch (e) {}

      this.timer = setTimeout(function () {
        self.initialize();
      }, 60000);
    },

    check : function (ps) {
      return (/photo/).test(ps.type);
    },

    boards : null,

    getBoards : function () {
      return this.boards;
    },

    _getBoards : function (check_login) {
      var self = this;
      return request(this.BOOKMARK_URL, { responseType: 'document' }).then(function (res) {
        var doc = res.response;
        var boards = [];
        // for old UI
        $X('//div[@class="BoardList"]//ul/li', doc).forEach(function (li) {
          boards.push({
            id   : $X('./@data', li)[0],
            name : $X('./span/text()', li)[0].trim()
          });
          self.is_new_api = false;
        });
        // for new UI
        $X('//div[@class="boardPickerInner"]//ul/li[@class="boardPickerItem"]', doc).forEach(function (li) {
          boards.push({
            id   : $X('./@data-id', li)[0],
            name : $X('./text()', li).join('\n').trim()
          });
          self.is_new_api = true;
        });
        // for new bookmarklet
        function inBoards(id) {
          for (var i = 0, len = boards.length ; i < len ; i++) {
            if (boards[i].id === id) {
              return true;
            }
          }
          return false;
        }
        $X('//div[@class="boardPickerListItems"]/ul/li/div[@class="boardListItem"]', doc).forEach(function (li) {
          var id = $X('./@data-id', li)[0];
          if (!inBoards(id)) {
            boards.push({
              id   : id,
              name : $X('.//span[contains(concat(" ",@class," ")," boardName ")]/text()', li).join('\n').trim()
            });
          }
          self.is_new_api = true;
        });
        if (check_login && !boards.length) {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
        }
        self.boards = boards;
        return boards;
      });
    },

    getCSRFToken : function () {
      var self = this;
      return getCookies('.pinterest.com', 'csrftoken').then(function (cookies) {
        if (cookies.length) {
          return cookies[cookies.length - 1].value;
        } else {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
        }
      });
    },

    post : function (ps) {
      var self = this;
      return (ps.pinboard ? Promise.resolve([{id : ps.pinboard}]) : self._getBoards(true)).then(function (boards) {
        return self.getCSRFToken().then(function (csrftoken) {
          return self.is_new_api ?
            self._post_2(ps, boards[0].id, csrftoken) : self._post(ps, boards[0].id, csrftoken);
        });
      });
    },

    _post : function (ps, board_id, csrftoken) {
      var self = this;

      var caption = self._make_caption(ps);

      var sendContent = {};
      if (ps.file) {
        sendContent = {
          details : caption,
          link    : ps.pageUrl,
          img_url : ps.itemUrl,
          img     : ps.file
        };
      } else {
        sendContent = {
          details : caption,
          link    : ps.pageUrl,
          img_url : ps.itemUrl
        };
      }
      sendContent.board = board_id;
      sendContent.csrfmiddlewaretoken = csrftoken;

      return request(self.UPLOAD_URL, {
        sendContent : sendContent,
        responseType: 'json'
      }).then(function (res) {
        var json = res.response;
        if (json && json.status && (json.status === 'fail')) {
          throw new Error(json.message);
        }
      });
    },

    _post_2 : function (ps, board_id, csrftoken) {
      var self = this;

      var data = {
        options : {
          board_id    : board_id,
          description : self._make_caption(ps),
          link        : ps.pageUrl,
          image_url   : ps.itemUrl,
          method      : 'bookmarklet',
          is_video    : 'false'
        },
        context : {
          app_version : 'ceac'
        }
      };

      return (ps.file ? self._upload(ps.file, data, csrftoken) : Promise.resolve(data)).then(function (data) {
        return request(self.POST_URL_2, {
          sendContent : {
            data : JSON.stringify(data)
          },
          headers : {
            'X-CSRFToken'      : csrftoken,
            'X-NEW-APP'        : 1,
            'X-Requested-With' : 'XMLHttpRequest'
          },
          responseType: 'json'
        }).then(function (res) {
          var json = res.response;
          if (json && json.error) {
            throw new Error('Could not post an image');
          }
        });
      });
    },

    _upload : function (file, data, csrftoken) {
      var self = this;
      return request(self.UPLOAD_URL_2 + '?' + queryString({ img : file.name }), {
        sendContent : {
          img : file
        },
        headers : {
          'X-CSRFToken'      : csrftoken,
          'X-File-Name'      : file.name,
          'X-Requested-With' : 'XMLHttpRequest'
        },
        responseType: 'json'
      }).then(function (res) {
        var json = res.response;
        if (!json || (json && !json.success)) {
          throw new Error('Could not upload an image');
        }
        data.options.link      = '';
        data.options.image_url = json.image_url;
        data.options.method    = 'uploaded';
        return data;
      });
    },

    _make_caption : function (ps) {
      var caption = '';
      if (ps.description || ps.body) {
        caption = joinText([
          ps.description,
          (ps.body) ? '“' + ps.body + '”' : ''
        ], '\n\n', true);
      } else {
        caption = ps.item || ps.page;
      }

      if (caption.length > 400) { // Max length seems 500 on UI, but no limit in API
        caption = caption.substring(0, 400) + '...';
      }

      if (ps.file) {
        caption = joinText([
          caption,
          '(via ' + ps.pageUrl + ' )'
        ], '\n\n', true);
      }

      return caption;
    }
  });

  Models.register({
    name      : 'Gyazo',
    ICON      : skin + 'gyazo.ico',
    LINK      : 'http://gyazo.com/',
    LOGIN_URL : null,

    POST_URL  : 'http://gyazo.com/upload.cgi',

    check : function (ps) {
      return (/photo/).test(ps.type);
    },

    post : function (ps) {
      ps = update({}, ps);
      return this.upload(ps).then(function (url) {
        if (url) {
          window.open(url, '');
        }
      });
    },

    upload : function (ps) {
      var self = this;
      return this._download(ps).then(function (file) {
        return request(self.POST_URL, {
          sendContent : {
            id        : window.localStorage.gyazo_id || '',
            imagedata : file
          }
        }).then(function (res) {
          var gyazo_id = res.getResponseHeader('X-Gyazo-Id');
          if (gyazo_id) {
            window.localStorage.gyazo_id = gyazo_id;
          }
          return res.responseText;
        });
      });
    },

    _download : function (ps) {
      return (
        ps.file ? Promise.resolve(ps.file) : download(ps.itemUrl).then(function (entry) {
          return getFileFromEntry(entry);
        })
      );
    },

    base64ToFileEntry : function (base64, type, ext) {
      return createFileEntryFromBlob(base64ToBlob(base64, type), ext).then(function (entry) {
        return getFileFromEntry(entry).then(function (file) {
          return file;
        });
      });
    }
  });

  Models.register({
    name      : 'mixi',
    ICON      : 'http://mixi.jp/favicon.ico',
    LINK      : 'https://mixi.jp/',
    URL       : 'http://mixi.jp/',

    check : function (ps) {
      return (/link/).test(ps.type);
    },

    post : function (ps) {
      var self = this;
      var checkKey = '5e4317cedfc5858733a2740d1f59ab4088e370a7';
      return request(self.URL + 'share.pl?' + queryString({
        k : checkKey,
        u : ps.pageUrl
      })).then(function (res) {
        if (res.responseText.indexOf('share_form') < 0) {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
        }

        var doc       = createHTML(res.responseText);
        /* var postUrl   = doc.querySelector('form[name="share_form"]').getAttribute('action'); */
        var postKey   = doc.querySelector('input[name="post_key"]').value;
        var url       = doc.querySelector('input[name="u"]').value;
        var key       = doc.querySelector('input[name="k"]').value;
        var privacyId = doc.querySelector('input[name="selected_privacy_id"]').value;

        var sendContent = {
          post_key            : postKey,
          selected_privacy_id : privacyId,
          u                   : url,
          k                   : key,
          comment             : ps.description
        };

        if (doc.querySelector('input[name="selected_image_uri"]')) {
          var imageUrl  = doc.querySelector('input[name="selected_image_uri"]').value;
          sendContent.selected_image_uri = imageUrl;
          var imageKey  = doc.querySelector('input[name="selected_image_pkey"]').value;
          sendContent.selected_image_pkey = imageKey;
        }

        return request(self.URL + 'share.pl?mode=share', {
          method      : 'POST',
          sendContent : sendContent
        });
      });
    }
  });

  function shortenUrls(text, model) {
    var reUrl = /https?[-_.!~*\'()a-zA-Z0-9;\/?:\@&=+\$,%#\^]+/g;
    if (!reUrl.test(text)) {
      return Promise.resolve(text);
    }

    var urls = text.match(reUrl);
    return Promise.all(urls.map(function (url) {
      return model.shorten(url);
    })).then(function (ress) {
      arrayZip(urls, ress).forEach(function (pair) {
        var url = pair[0], res = pair[1];
        text = text.replace(url, res);
      });

      return text;
    });
  }

  Models.copyTo(exports);

  Models.check = function (ps) {
    return this.values.filter(function (m) {
      return (ps.favorite && ps.favorite.name === (m.typeName || m.name)) || (m.check && m.check(ps));
    });
  };

  Models.getDefaults = function (ps) {
    var config = TBRL.Config['services'];
    return this.check(ps).filter(function (m) {
      return Models.getPostConfig(config, m.name, ps, m) === 'default';
    });
  };

  Models.getEnables = function (ps) {
    var config = TBRL.Config['services'];
    return this.check(ps).filter(function (m) {
      m.config = (m.config || {});

      var val = m.config[ps.type] = Models.getPostConfig(config, m.name, ps, m);
      return val === undefined || /default|enabled/.test(val);
    });
  };

  Models.getConfig = function (ps, poster) {
    var c  = Models.getPostConfig(TBRL.Config['services'], poster.name, ps, poster);
    if (c === 'default') {
      return 'default';
    } else if (c === undefined || 'enabled' === c) {
      return 'enabled';
    } else {
      return 'disabled';
    }
  };

  Models.getConfigObject = function (config, name) {
    return config[name] || {};
  };

  Models.getPostConfig = function (config, name, ps, model) {
    var c = Models.getConfigObject(config, name);
    return (ps.favorite && ps.favorite.name === (model.typeName || name)) ? c.favorite : c[ps.type];
  };

  Models.multipleTumblelogs = [];
  Models.getMultiTumblelogs = function (throwError) {
    Models.removeMultiTumblelogs();
    return Tumblr.getTumblelogs().then(function (blogs) {
      return blogs.map(function (blog) {
        var model = update({}, Tumblr);
        model.name = 'Tumblr - ' + blog.name;
        model.typeName = 'Tumblr';
        addBefore(model, 'appendTags', function (form, ps) {
          form.channel_id = blog.id;
        });
        Models.register(model, 'Tumblr', true);
        Models.multipleTumblelogs.push(model);
        return model;
      });
    }).catch(function (e) {
      if (throwError && !(Tumblr.form_key && Tumblr.channel_id)) {
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', Tumblr.name));
      }

      alert('Multiple Tumblelog' + ': ' +
        (e.message.hasOwnProperty('status') ? '\n' + ('HTTP Status Code ' + e.message.status).indent(4) : '\n' + e.message.indent(4)));
    });
  };

  Models.removeMultiTumblelogs = function () {
    Models.multipleTumblelogs.forEach(function (model) {
      Models.remove(model);
    });
    Models.multipleTumblelogs = [];
  };

  // HatenaBlog
  Models.hatenaBlogs = [];
  Models.getHatenaBlogs = function () {
    Models.removeHatenaBlogs();
    return Models.HatenaBlog.getBlogs().then(function (blogs) {
      return blogs.map(function (blog) {
        // blog is {url, title, admin_url, icon_url}
        var model = update({}, Models.HatenaBlog);
        model.check = model._check;
        delete model._check;
        model.LINK      = blog.url;
        model.name      = model.name + ' - ' + blog.title;
        model.ICON      = blog.icon_url;
        model.BLOG_ADMIN_URL = blog.admin_url;
        Models.register(model);
        Models.hatenaBlogs.push(model);
        return model;
      });
    }).catch(function (e) {
      alert('HatenaBlog: ' +
        (e.message.hasOwnProperty('status') ? '\n' + ('HTTP Status Code ' + e.message.status).indent(4) : '\n' + e.message.indent(4)));
    });
  };
  Models.removeHatenaBlogs = function () {
    Models.hatenaBlogs.forEach(function (model) {
      Models.remove(model);
    });
    Models.hatenaBlogs = [];
  };

  // WebHook
  Models.WebHooks = [];
  Models.addWebHooks = function () {
    Models.removeWebHooks();
    var webhook = update({}, WebHook);
    webhook.POST_URL = TBRL.Config['post']['webhook_url'];
    Models.register(webhook);
    Models.WebHooks.push(webhook);
  };
  Models.removeWebHooks = function () {
    Models.WebHooks.forEach(function (model) {
      Models.remove(model);
    });
    Models.WebHooks = [];
  };
}(this));
/* vim: set sw=2 ts=2 et tw=80 : */
