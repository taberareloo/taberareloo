var Models = new Repository();

function backgroundAlert(message){
	alert(message);
}
function backgroundConfirm(message){
	return confirm(message);
}

function backgroundError(message, url){
	var res = confirm(message);
	if(res){
		chrome.tabs.getSelected(null, function(tab){
			chrome.tabs.create({
				index:tab.index+1,
				url:url,
				selected:true
			});
		});
	}
}

var Tumblr = {
  name : 'Tumblr',
  ICON : 'http://www.tumblr.com/images/favicon.gif',
  MEDIA_URL : 'http://media.tumblr.com/',
  TUMBLR_URL : 'http://www.tumblr.com/',

  /**
   * ポストを削除する。
   *
   * @param {Number || String} id ポストID。
   * @return {Deferred}
   */
  remove : function(id){
    var self = this;
    return this.getToken().addCallback(function(token){
      return request(Tumblr.TUMBLR_URL+'delete', {
        redirectionLimit : 0,
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
   * @return {Deferred}
   */
  trimReblogInfo : function(form){
    if(!getPref('trimReblogInfo'))
     return;

    function trimQuote(entry){
      entry = entry.replace(/<p><\/p>/g, '').replace(/<p><a[^<]+<\/a>:<\/p>/g, '');
      entry = (function(all, contents){
        return contents.replace(/<blockquote>(([\n\r]|.)+)<\/blockquote>/gm, arguments.callee);
      })(null, entry);
      return entry.trim();
    }

    switch(form['post[type]']){
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
  check : function(ps){
    return (/(regular|photo|quote|link|conversation|video)/).test(ps.type);
  },

  /**
   * 新規エントリーをポストする。
   *
   * @param {Object} ps
   * @return {Deferred}
   */
  post : function(ps){
    var self = this;
    var endpoint = Tumblr.TUMBLR_URL + 'new/' + ps.type;
    return this.postForm(function(){
      return self.getForm(endpoint).addCallback(function(form){
        update(form, Tumblr[ps.type.capitalize()].convertToForm(ps));

        self.appendTags(form, ps);

        return request(endpoint, {sendContent : form});
      });
    });
  },

  /**
   * ポストフォームを取得する。
   * reblogおよび新規エントリーのどちらでも利用できる。
   *
   * @param {Object} url フォームURL。
   * @return {Deferred}
   */
  getForm : function(url){
    var self = this;
    return request(url).addCallback(function(res){
      var doc = createHTML(res.responseText);
      var form = formContents(doc);
      delete form.preview_post;
      form.redirect_to = Tumblr.TUMBLR_URL+'dashboard';

      if(form.reblog_post_id){
        self.trimReblogInfo(form);

        // Tumblrから他サービスへポストするため画像URLを取得しておく
        if(form['post[type]']=='photo')
          form.image = $X('id("edit_post")//img[contains(@src, "media.tumblr.com/") or contains(@src, "data.tumblr.com/")]/@src', doc)[0];
      }

      return form;
    });
  },

  /**
   * フォームへタグとプライベートを追加する。
   *
   * @param {Object} url フォームURL。
   * @return {Deferred}
   */
  appendTags : function(form, ps){
    if(ps.private!=null)
      form['post[state]'] = (ps.private)? 'private' : 0;

    return update(form, {
      'post[tags]' : (ps.tags && ps.tags.length)? joinText(ps.tags, ',') : ''
    });
  },

  /**
   * reblogする。
   * Tombloo.Service.extractors.ReBlogの各抽出メソッドを使いreblog情報を抽出できる。
   *
   * @param {Object} ps
   * @return {Deferred}
   */
  favor : function(ps){
    // メモをreblogフォームの適切なフィールドの末尾に追加する
    var form = ps.favorite.form;
    items(Tumblr[ps.type.capitalize()].convertToForm({
      description : ps.description
    })).forEach(function(item){
      var name = item[0], value = item[1];
      if(!value)
        return;

      form[name] += '\n\n' + value;
    });

    this.appendTags(form, ps);

    return this.postForm(function(){
      return request(ps.favorite.endpoint, {sendContent : form})
    });
  },

  /**
   * フォームをポストする。
   * 新規エントリーとreblogのエラー処理をまとめる。
   *
   * @param {Function} fn
   * @return {Deferred}
   */
  postForm : function(fn){
    var self = this;
    return succeed().addCallback(fn);
  },

  /**
   * ポストや削除に使われるトークン(form_key)を取得する。
   * 結果はキャッシュされ、再ログインまで再取得は行われない。
   *
   * @return {Deferred} トークン(form_key)が返される。
   */
  getToken : function(){
    var self = this;
    return request(Tumblr.TUMBLR_URL+'new/text').addCallback(function(res){
      var doc = createHTML(res.responseText);
      return self.token = $X('id("form_key")/@value', doc)[0];
    });
  }

};


Tumblr.Regular = {
  convertToForm : function(ps){
    return {
      'post[type]' : ps.type,
      'post[one]'  : ps.item,
      'post[two]'  : joinText([ps.body, ps.description], '\n\n')
    };
  }
};

Tumblr.Photo = {
  convertToForm : function(ps){
    var form = {
      'post[type]'  : ps.type,
      't'           : ps.item,
      'u'           : ps.pageUrl,
      'post[two]'   : joinText([
        (ps.item? ps.item.link(ps.pageUrl) : '') + (ps.author? ' (via ' + ps.author.link(ps.authorUrl) + ')' : ''),
        ps.description], '\n\n'),
      'post[three]' : ps.pageUrl
    };
    ps.file? (form['images[o1]'] = ps.file) : (form['photo_src'] = ps.itemUrl);

    return form;
  }
};

Tumblr.Video = {
  convertToForm : function(ps){
    return {
      'post[type]' : ps.type,
      'post[one]'  : ps.body || ps.itemUrl,
      'post[two]'  : joinText([
        (ps.item? ps.item.link(ps.pageUrl) : '') + (ps.author? ' (via ' + ps.author.link(ps.authorUrl) + ')' : ''),
        ps.description], '\n\n')
    };
  }
};

Tumblr.Link = {
  convertToForm : function(ps){
    var thumb = getPref('thumbnailTemplate').replace(RegExp('{url}', 'g'), ps.pageUrl);
    return {
      'post[type]'  : ps.type,
      'post[one]'   : ps.item,
      'post[two]'   : ps.itemUrl,
      'post[three]' : joinText([thumb, ps.body, ps.description], '\n\n')
    };
  }
};

Tumblr.Conversation = {
  convertToForm : function(ps){
    return {
      'post[type]' : ps.type,
      'post[one]'  : ps.item,
      'post[two]'  : joinText([ps.body, ps.description], '\n\n')
    };
  }
};

Tumblr.Quote = {
  convertToForm : function(ps){
    return {
      'post[type]' : ps.type,
      'post[one]'  : ps.body,
      'post[two]'  : joinText([(ps.item? ps.item.link(ps.pageUrl) : ''), ps.description], '\n\n')
    };
  }
};

Models.register(Tumblr);

Models.register({
  name : 'Hatena',
  ICON : 'http://www.hatena.ne.jp/favicon.ico',

  getToken : function(){
    if(this.token){
      return succeed(this.token);
    } else {
      var self = this;
      return request('http://d.hatena.ne.jp/edit').addCallback(function(res){
        if(res.responseText.match(/\srkm\s*:\s*['"](.+?)['"]/))
          return self.token = RegExp.$1;
      });
    }
  },

  reprTags: function (tags) {
    return tags ? tags.map(function(t){
      return '[' + t + ']';
    }).join('') : '' ;
  }
});

Models.register({
  name : 'HatenaBookmark',
  ICON : 'http://b.hatena.ne.jp/favicon.ico',

  POST_URL : 'http://b.hatena.ne.jp/add',

  check : function(ps){
    return (/(photo|quote|link|conversation|video)/).test(ps.type) && !ps.file;
  },

  post : function(ps){
    // タイトルは共有されているため送信しない
    return this.addBookmark(ps.itemUrl, null, ps.tags, joinText([ps.body, ps.description], ' ', true));
  },

  getToken : function(){
    if(this.token){
      return succeed(this.token);
    } else {
      var self = this;
      return request(HatenaBookmark.POST_URL).addCallback(function(res){
        if(res.responseText.extract(/new Hatena.Bookmark.User\('.*?',\s.*'(.*?)', /))
        return self.token = RegExp.$1;
      });
    }
  },

  addBookmark : function(url, title, tags, description){
    return this.getToken().addCallback(function(token){
      return request('http://b.hatena.ne.jp/bookmarklet.edit', {
        redirectionLimit : 0,
        method: 'POST',
        sendContent : {
          rks     : token,
          url     : url.replace(/%[0-9a-f]{2}/g, function(s){
            return s.toUpperCase();
          }),
          title   : title,
          comment : Models.Hatena.reprTags(tags) + description.replace(/[\n\r]+/g, ' ')
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
  getSuggestions : function(url){
    var self = this;
    return succeed().addCallback(function(){
      return request(self.POST_URL, {
        sendContent : {
          mode : 'confirm',
          url  : url
        }
      })
    }).addCallback(function(res){
      var tags = JSON.parse('(' + res.responseText.extract(/var tags =(.*);$/m) + ')') || {};

      return {
        duplicated : (/bookmarked-confirm/).test(res.responseText),
        recommended : $X(
          'id("recommend-tags")/span[@class="tag"]/text()',
          createHTML(res.responseText)
          ),
        tags : map(function(pair){
          var tag = pair[0], info = pair[1];
          return {
            name      : tag,
            frequency : info.count
          }
        }, items(tags))
      }
    });
  }
});

Models.register({
  name : 'Delicious',
  ICON : 'http://delicious.com/favicon.ico',

  /**
   * ユーザーの利用しているタグ一覧を取得する。
   *
   * @param {String} user 対象ユーザー名。未指定の場合、ログインしているユーザー名が使われる。
   * @return {Array}
   */
  getUserTags : function(user){
    return this.getCurrentUser(user).addCallback(function(user){
      // 同期でエラーが起きないようにする
      return succeed().addCallback(function(){
        return request('http://feeds.delicious.com/v2/json/tags/' + user);
      }).addCallback(function(res){
        var tags = JSON.parse(res.responseText);
        return Object.keys(tags).reduce(function(memo, tag){
          memo.push({
            name      : tag,
            frequency : tags[tag]
          });
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
  getSuggestions : function(url){
    var self = this;
    var ds = {
      tags : this.getUserTags(),
      suggestions : this.getCurrentUser().addCallback(function(user){
        // ブックマークレット用画面の削除リンクを使い既ブックマークを判定する
        return request('http://delicious.com/save', {
          queryString : {
            noui : 1,
            url  : url
          }
        });
      }).addCallback(function(res){
        var doc = createHTML(res.responseText);
        if(!doc.getElementById('title'))
          throw new Error(getMessage('error.notLoggedin'));

        function getTags(part){
          return $X('id("save-' + part + '-tags")//a[contains(@class, "tag-list-tag")]/text()', doc);
        }
        return {
          editPage : editPage = 'http://delicious.com/save?url=' + url,
          form : {
            item        : doc.getElementById('title').value,
            description : doc.getElementById('notes').value,
            tags        : doc.getElementById('tags').value.split(' '),
            private     : doc.getElementById('share').checked
          },
          duplicated : !!doc.getElementById('delete'),
          recommended : getTags('reco'),
          popular : getTags('pop'),
          network : getTags('net')
        }
      })
    };

    return new DeferredHash(ds).addCallback(function(ress){
      // エラーチェック
      values(ress).forEach(function(pair){
        var success = pair[0], res = pair[1];
        if(!success)
          throw res;
      });

      var res = ress.suggestions[1];
      res.tags = ress.tags[1];
      return res;
    });
  },

  getCurrentUser : function(defaultUser){
    var self = this;
    if(defaultUser){
      return succeed(defaultUser);
    } else if(this.currentUser){
      return succeed(this.currentUser);
    } else {
      return request("http://delicious.com/save").addCallback(function(res){
        var doc = createHTML(res.responseText);
        var match = res.responseText.match(/Delicious\.Config\.set\('LoggedInUsername', '([^']+)'\);/);
        if(match){
          var user = match[1];
          self.currentUser = user;
          return user;
        } else {
          throw new Error(getMessage('error.notLoggedin'));
        }
      });
    }
  },

  check : function(ps){
    return (/(photo|quote|link|conversation|video)/).test(ps.type) && !ps.file;
  },

  post : function(ps){
    return request('http://delicious.com/post/', {
      queryString :  {
        title : ps.item,
        url   : ps.itemUrl
      }
    }).addCallback(function(res){
      var doc = createHTML(res.responseText);
      var elmForm = doc.getElementById('saveitem');
      if(!elmForm)
        throw new Error(getMessage('error.notLoggedin'));

      return request('http://delicious.com' + $X('id("saveitem")/@action', doc)[0], {
        redirectionLimit : 0,
        sendContent : update(formContents(elmForm), {
          description : ps.item,
          jump        : 'no',
          notes       : joinText([ps.body, ps.description], ' ', true),
          tags        : ps.tags? ps.tags.join(' ') : '',
          share       : ps.private? 'no' : ''
        })
      });
    });
  }
});

Models.register({
  name : 'LivedoorClip',
  ICON : 'http://clip.livedoor.com/favicon.ico',
  POST_URL : 'http://clip.livedoor.com/clip/add',

  check : function(ps){
    return (/(photo|quote|link|conversation|video)/).test(ps.type) && !ps.file;
  },

  post : function(ps){
    return LivedoorClip.getToken().addCallback(function(token){
      var content = {
        rate    : ps.rate? ps.rate : '',
        title   : ps.item,
        postKey : token,
        link    : ps.itemUrl,
        tags    : ps.tags? ps.tags.join(' ') : '',
        notes   : joinText([ps.body, ps.description], ' ', true),
        public  : ps.private? 'off' : 'on'
      };
      return request(LivedoorClip.POST_URL, {
        redirectionLimit : 0,
        sendContent : content
      });
    });
  },

  getSuggestions : function(url){
    return request(LivedoorClip.POST_URL, {
      queryString : {
        link : url || 'http://tombloo/'
      }
    }).addCallback(function(res){
      var doc = createHTML(res.responseText);
      return {
        duplicated : !!$X('//form[@name="delete_form"]', doc)[0],
        tags : $X('//div[@class="TagBox"]/span/text()', doc).map(function(tag){
          return {
            name      : tag,
            frequency : -1
          };
        })
      }
    });
  },

  getToken : function(){
    if(this.token){
      return succeed(this.token);
    } else {
      var self = this;
      return request(LivedoorClip.POST_URL, {
        queryString : {
          link : 'http://tombloo/'
        }
      }).addCallback(function(res){
        if(res.responseText.match(/"postkey" value="(.*)"/)){
          self.token = RegExp.$1;
          return self.token;
        }
        throw new Error(getMessage('error.notLoggedin'));
      });
    }
  }
});

Models.register({
  name : 'Google',
  ICON : 'http://www.google.com/favicon.ico'
});

Models.register({
  name : 'GoogleBookmarks',
  ICON : Models.Google.ICON,

  check : function(ps){
    return (/(photo|quote|link|conversation|video)/).test(ps.type) && !ps.file;
  },

  post : function(ps){
    return request('http://www.google.com/bookmarks/mark', {
      queryString :  {
        op : 'add'
      }
    }).addCallback(function(res){
      var doc = createHTML(res.responseText);
      if(doc.getElementById('gaia_loginform'))
        throw new Error(getMessage('error.notLoggedin'));

      var form = $X('descendant::form[contains(concat(" ",normalize-space(@name)," ")," add_bkmk_form ")]')[0];
      var fs = formContents(form);
      return request('http://www.google.com'+$X('//form[@name="add_bkmk_form"]/@action', doc)[0], {
        redirectionLimit : 0,
        sendContent  : {
          title      : ps.item,
          bkmk       : ps.itemUrl,
          annotation : joinText([ps.body, ps.description], ' ', true),
          labels     : ps.tags? ps.tags.join(',') : '',
          btnA       : fs.btnA,
          sig        : fs.sig
        }
      });
    });
  }
});

Models.register({
  name : 'FriendFeed',
  ICON : 'http://friendfeed.com/favicon.ico',
  check : function(ps){
    return (/(photo|quote|link|conversation|video)/).test(ps.type) && !ps.file;
  },

  getToken : function(){
    return request('http://friendfeed.com/share/bookmarklet/frame')
    .addCallback(function(res){
      var doc = createHTML(res.responseText);
      if($X('descendant::span[child::a[@href="http://friendfeed.com/account/login"]]', doc).length){
        throw new Error(getMessage('error.notLoggedin'));
      }
      return $X('descendant::input[contains(concat(" ",normalize-space(@name)," ")," at ")]/@value', doc)[0];
    });
  },

  post : function(ps){
    var self = this;
    return this.getToken().addCallback(function(token){
      return request('https://friendfeed.com/a/bookmarklet', {
        redirectionLimit : 0,
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
  ICON : 'http://twitter.com/favicon.ico',
  URL  : 'http://twitter.com',
  SHORTEN_SERVICE : 'bit.ly',

  check : function(ps){
    return (/(regular|photo|quote|link|conversation|video)/).test(ps.type) && !ps.file;
  },

  post : function(ps){
    return this.update(joinText([ps.item, ps.itemUrl, ps.body, ps.description], ' ', true));
  },

  update : function(status){
    return maybeDeferred((status.length < 140)?
      status : shortenUrls(status, Models[this.SHORTEN_SERVICE])
    ).addCallback(function(status){
      return Twitter.getToken().addCallback(function(token){
        // FIXME: 403が発生することがあったため redirectionLimit:0 を外す
        token.status = status;
        return request(self.URL + '/status/update', update({
          sendContent : token
        }));
      });
    });
  },

  favor : function(ps){
    return this.addFavorite(ps.favorite.id);
  },

  getToken : function(){
    return request(this.URL + '/account/settings').addCallback(function(res){
      var html = res.responseText;
      if(~html.indexOf('class="signin"'))
        throw new Error(getMessage('error.notLoggedin'));

      return {
        authenticity_token : html.extract(/authenticity_token.+value="(.+?)"/),
        siv                : html.extract(/logout\?siv=(.+?)"/)
      }
    });
  },

  remove : function(id){
    var self = this;
    return Twitter.getToken().addCallback(function(ps){
      ps._method = 'delete';
      return request(self.URL + '/status/destroy/' + id, {
        redirectionLimit : 0,
        referrer : self.URL + '/',
        sendContent : ps
      });
    });
  },

  addFavorite : function(id){
    var self = this;
    return Twitter.getToken().addCallback(function(ps){
      return request(self.URL + '/favourings/create/' + id, {
        redirectionLimit : 0,
        referrer : self.URL + '/',
        sendContent : ps
      });
    });
  },

  getRecipients : function(){
    var self = this;
    return request(this.URL + '/direct_messages/recipients_list?twttr=true').addCallback(function(res){
      return map(function(pair){
        return {id:pair[0], name:pair[1]};
      }, JSON.parse('(' + res.responseText + ')'));
    });
  }
});

Models.register({
  name : 'Instapaper',
  ICON : chrome.extension.getURL('skin/instapaper.ico'),
  POST_URL: 'http://www.instapaper.com/edit',
  check : function(ps){
    return (/(quote|link)/).test(ps.type);
  },
  post : function(ps){
    var url = this.POST_URL;
    return request(url).addCallback(function(res){
      var doc = createHTML(res.responseText);
      if($X('id(content)/form')[0])
        throw new Error(getMessage('error.notLoggedin'));
      return $X('//input[@id="form_key"]/@value', doc)[0];
    }).addCallback(function(token){
      return request(url, {
        redirectionLimit: 0,
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

// http://developer.yahoo.co.jp/jlp/MAService/V1/parse.html
// APP_ID => Taberareloo ID
Models.register({
  name : 'Yahoo',
  APP_ID : 'KaZybVOxg67G6sNQLuSMqenqXLGGIbfVJGCWgHrPWGMlQS5BGWIgAVcueAxAByQBatwmBYewBgEs3.3y',

  parse : function(ps){
    ps.appid = this.APP_ID;
    return request('http://jlp.yahooapis.jp/MAService/V1/parse', {
      charset     : 'utf-8',
      sendContent : ps
    }).addCallback(function(res){
      return res.responseXML;
    });
  },

  getKanaReadings : function(str){
    return this.parse({
      sentence : str,
      response : 'reading'
    }).addCallback(function(res){
      return $X('descendant::reading/text()', res);
      //return $A(res.getElementsByTagName('reading')).map(function(i){return i.textContent});
    });
  },

  getRomaReadings : function(str){
    return this.getKanaReadings(str).addCallback(function(rs){
      return rs.join('\u0000').toRoma().split('\u0000');
    });
  }
});

Models.register({
  name : 'YahooBookmarks',
  ICON : 'http://bookmarks.yahoo.co.jp/favicon.ico',

  check : function(ps){
    return (/(photo|quote|link|conversation|video)/).test(ps.type) && !ps.file;
  },

  post : function(ps){
    return request('http://bookmarks.yahoo.co.jp/action/post').addCallback(function(res){
      if(res.responseText.indexOf('login_form')!=-1)
        throw new Error(getMessage('error.notLoggedin'));

      var doc = createHTML(res.responseText);
      return formContents($X('id("addbookmark")/descendant::div[contains(concat(" ",normalize-space(@class)," ")," bd ")]', doc)[0]);
    }).addCallback(function(fs){
      return request('http://bookmarks.yahoo.co.jp/action/post/done', {
        redirectionLimit : 0,
        sendContent  : {
          title      : ps.item,
          url        : ps.itemUrl,
          desc       : joinText([ps.body, ps.description], ' ', true),
          tags       : ps.tags? ps.tags.join(' ') : '',
          crumbs     : fs.crumbs,
          visibility : ps.private==null? fs.visibility : (ps.private? 0 : 1)
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
  getSuggestions : function(url){
    return request('http://bookmarks.yahoo.co.jp/bookmarklet/showpopup', {
      queryString : {
        u : url
      }
    }).addCallback(function(res){
      var doc = createHTML(res.responseText);
      if(!$X('id("bmtsave")', doc)[0])
        throw new Error(getMessage('error.notLoggedin'));

      function getTags(part){
        try{
          return JSON.parse(unescapeHTML(res.responseText.extract(RegExp('^' + part + ' ?= ?(.+);$', 'm'), 1))) || [];
        }catch(e){
          return [];
        }
      }

      return {
        duplicated : !!$X('//input[@name="docid"]', doc)[0],
        popular : getTags('rectags'),
        tags : getTags('yourtags').map(function(tag){
          return {
            name      : tag,
            frequency : -1
          }
        })
      };
    });
  }
});

// http://www.kawa.net/works/ajax/romanize/japanese.html
Models.register({
  name : 'Kawa',

  getRomaReadings : function(text){
    return request('http://www.kawa.net/works/ajax/romanize/romanize.cgi', {
      queryString : {
        // mecab-utf8
        // japanese
        // kana
        mode : 'japanese',
        q : text
      }
    }).addCallback(function(res){
      /*
      return map(function(s){
        return ''+s.@title || ''+s;
      }, createXML(res.responseText).li.span);
      */
    });
  }
});

Models.register({
  name : 'is.gd',
  ICON : 'http://is.gd/favicon.ico',
  URL  : 'http://is.gd/',

  shorten : function(url){
    if((/\/\/is\.gd\//).test(url))
      return succeed(url);

    return request(this.URL + '/api.php', {
      redirectionLimit : 0,
      queryString : {
        longurl : url
      }
    }).addCallback(function(res){
      return res.responseText;
    });
  },

  expand : function(url){
    return request(url, {
      redirectionLimit : 0
    }).addCallback(function(res){
      return res.channel.URI.spec;
    });
  }
});

Models.register({
  name    : 'bit.ly',
  ICON    : 'http://bit.ly/static/images/favicon.png',
  URL     : 'http://api.bit.ly',
  API_KEY : 'R_8d078b93e8213f98c239718ced551fad',
  USER    : 'to',
  VERSION : '2.0.1',

  shorten : function(url){
    var self = this;
    if((/\/\/bit\.ly/).test(url))
      return succeed(url);

    return this.callMethod('shorten', {
      longUrl : url
    }).addCallback(function(res){
      return res[url].shortUrl;
    });
  },

  expand : function(url){
    var hash = url.split('/').pop();
    return this.callMethod('expand', {
      hash : hash
    }).addCallback(function(res){
      return res[hash].longUrl;
    });
  },

  callMethod : function(method, ps){
    var self = this;
    return request(this.URL + '/' + method, {
      queryString : update({
        version : this.VERSION,
        login   : this.USER,
        apiKey  : this.API_KEY
      }, ps)
    }).addCallback(function(res){
      res = JSON.parse('(' + res.responseText + ')');
      if(res.errorCode){
        var error = new Error([res.statusCode, res.errorCode, res.errorMessage].join(': '))
        error.detail = res;
        throw error;
      }

      return res.results;
    });
  }
});

function shortenUrls(text, model){
  var reUrl = /https?[-_.!~*\'()a-zA-Z0-9;\/?:\@&=+\$,%#]+/g;
  if(!reUrl.test(text))
    return;

  var urls = text.match(reUrl);
  return gatherResults(urls.map(function(url){
    return model.shorten(url);
  })).addCallback(function(ress){
    zip(urls, ress).forEach(function(pair){
      var url = pair[0], res = pair[1];
      text = text.replace(url, res);
    });

    return text;
  });
}

Models.values.forEach(function(val){
  this[val.name] = val;
}, this);

