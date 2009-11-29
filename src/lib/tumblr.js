var Tumblr = {
  name : "Tumblr",
  ICON : "http://www.tumblr.com/images/favicon.gif",
  TUMBLR_URL : 'http://www.tumblr.com/',
  private : false,
  check : function(ps){
    return (/(regular|photo|quote|link|conversation|video)/).test(ps.type);
  },
  post : function(ps){
    var self = this;
    var url = this.TUMBLR_URL+"new/"+ps.type+"/";
    return this.getForm(url).addCallback(function(form){
      delete form.allow_answers;
      if(self.private){
        form["post[state]"] = "private";
      }
      return doXHR(url, form);
    });
  },
	getForm : function(url){
		var self = this;
		return doXHR(url).addCallback(function(res){
			var doc = createHTML(res.responseText);
			var form = formContents(doc);
			delete form.preview_post;
			form.redirect_to = self.TUMBLR_URL+'dashboard';
			if(form.reblog_post_id){
				// self.trimReblogInfo(form);
				// Tumblrから他サービスへポストするため画像URLを取得しておく
				if(form['post[type]']=='photo')
          form.image = $X('id("edit_post")//img[contains(@src, "media.tumblr.com/") or contains(@src, "data.tumblr.com/")]/@src', doc)[0].value;
			}
			return form;
		});
	}
};
Models.register(Tumblr);

