// vim: fileencoding=utf-8

var main = new Deferred();
var background = chrome.extension.getBackgroundPage();
connect(window, 'onload', window, function(ev){
  // timer
  main.callback({
    type : 'photo'
  });
  /*
  var id = setTimeout(function(){
    clearTimeout(id);
    if(window.ps){// <= Global ps
      main.callback(ps);
    } else {
      id = setTimeout(arguments.callee, 100);
    }
  }, 100);
  */
});
alert("OK");
main.addCallback(function(ps){
  models = background.Models;
  $('typeIcon').setAttribute('src', 'skin/'+ps.type+'.png');
  var dialogPanel = new DialogPanel();
  var formPanel = new FormPanel(dialogPanel);
  formPanel.show();
})

/*
var DialogPanel = function(message){
  this.element = $('main');
  this.disconnects = [];
  if(message){
    this.message = $('message');
    this.message.appendChild($T(message));
    this.message.hidden = false;
  }
  connect(window, 'onunload', this, this.unload);
};

DialogPanel.prototype = {
  unload : function(){
    disconnectAll(this);
    this.disconnects.forEach(disconnectAll);
  },
  unload_regist : function(target){
    this.disconnects.push(target);
  }
}

var FormPanel = function(dialogPanel){
  this.elmForm = $('form');
  this.elmToggleDetail = $('toggleDetail');
  dialogPanel.unload_regist(this);
  // TODO i18n
  this.elmToggleDetail.setAttribute('title', 'Show Detail');
  this.dialogPanel = dialogPanel;
  $('type').appendChild($T(ps.type.capitalize()));
  $('typeIcon').setAttribute('src', 'skin/'+ps.type+'.png');
  $('post').setAttribute('value', 'Post');
  this.postersPanel = new PostersPanel(dialogPanel);
}

FormPanel.prototype = {
	labels : {
		item        : 'Title',
		itemUrl     : 'URL',
		tags        : 'Tags',
		description : 'Description',
	},
	types : {
		regular : {
			item        : {toggle : true},
			tags        : {toggle : true},
			description : {
				attributes : {rows : 7},
			},
		},
		link : {
			item        : {type : 'label'},
			itemUrl     : {toggle : true},
			tags        : {},
			description : {},
		},
		quote : {
			item        : {toggle : true},
			itemUrl     : {toggle : true},
			body        : {
				attributes : {
					flex : 1,
					rows : 4,
				},
			},
			tags        : {toggle : true},
			description : {toggle : true},
		},
		photo : {
			item        : {toggle : true},
			itemUrl     : {type : 'photo'},
			tags        : {toggle : true},
			description : {toggle : true},
		},
		video : {
			item        : {type : 'label'},
			itemUrl     : {toggle : true},
			tags        : {toggle : true},
			description : {toggle : true},
		},
	},
  show : function(){
    var self = this;
    var elmForm = this.elmForm;
    items(self.types[ps.type]).forEach(function(set){
      var name = set[0], def = set[1];
      def.attributes || (def.attributes = {});

      var value = (ps[name] != null)? ps[name] : '';
      var label = self.labels[name] || ps.type.capitalize();
      var attrs = update({
        id          : name,
        name        : name,
        value       : value,
        placeholder : label,
        hidden      : !!def.toggle
      }, def.attributes);

      var elm, field;
      if(name === 'tags'){
        elm = elmForm.appendChild($N('div', attrs));
        //field = self.tagsPanel = new TagsPanel(elm, self);
      } else if(name === 'description'){
        elm = elmForm.appendChild($N('div', attrs));
        //field = self.descriptionBox = new DescriptionBox(elm, def.attributes, self.dialogPanel);
      } else {
        switch(def.type){
          case 'label':
          elm = elmForm.appendChild($N('div',attrs));
          //field = new EditableLabel(elm);
          break;

          case 'photo':
          var src = ps.itemUrl;
          elm = elmForm.appendChild($N('div', attrs));
          //field = new ImageBox(elm, src, self.dialogPanel);
          break;

          default:
          field = elm = elmForm.appendChild($N('p', attrs))
          break;
        }
      }
      if(field) self.fields[name] = field;
      if(attrs.hidden){
        self.toggles.push(function(){
          elm.hidden = elm.hidden;
        });
      } else if(def.type === 'label'){
        self.toggles.push(function(){
          field.editable = !field.editable;
        });
      }
    });
  }
}
*/
/*
var TagsPanel = function(formPanel, dialogPanel){
  this.candidates = [];
  this.delay = 130;
  this.delimiter = ' ';
  this.container = $N('div' {id: 'container'});
  this.popup = new Popup(this);
  this.measure = new Measure(this);
  this.input = $N('input');
  this.content = $N('input');
  this.autoComplete = false;
  dialogPanel.unload_regist(this);
}

TagsPanel.prototype = {
  values : function(){
    return this.value.split(this.delimiter).filter(function(i){ return i });
  },
  padding : function(){
    return this._padding || (this._padding = Math.ceil(parseFloat(window.getComputedStyle(this, '').paddingLeft)));
  },
  newWords : function(){
    var check = {};
    this.values.forEach(function(val){
      check[val] = true;
    });
    this.candidates.forEach(function(cand){
      delete check[cand.value];
    });
    var res = [];
    for(var word in check)
      res.push(word);
    return res;
  },
  removeWord : function(word){
    var values = this.values();
    var index = values.indexOf(word);
    if(~index) values.splice(index, 1);
    values = values.join(this.delimiter);
    this.value = values + (values? this.delimiter : '');
  },
  scoreFor : (toscore, abb){
    if(!abb) return 0.9;
    var td = toscore.toLowerCase(), tdLength = toscore.length, abbLength = abb.length;
    if(tdLength < abbLength) return 0.0;
    var ad = abb.toLowerCase(), ahead, atail, found, score = null, tail, tail_score, penalty = 0, skipped;
    for(var pivot = abbLength; 0 < pivot; --pivot){
      ahead = ad.slice(0, pivot);
      atail = ad.slice(pivot) || "";
      found = td.indexOf(ahead);
      if(~found){
        tail = toscore.slice(found+pivot) || "";
        tail_score = arguments.callee(tail, atail);
        if(0 < tail_score){
          if(found){
            skipped = toscore.slice(0, found);
            if(/\s$/.test(skipped)){
              var nws = skipped.replace(/\S/, "").length;
              penalty = nws + (skipped.length - nws)*0.15;
            } else if(/^[A-Z]/.test(toscore.slice(found))){
              var nuc = skipped.replace(/[^A-Z]/, "").length;
              penalty = nuc + (skipped.length - nuc)*0.15;
            } else {
              penalty = skipped.length;
            }
          }
          score = (found + pivot - penalty + tail_score*tail.length)/tdLength;
        }
      }
      if(score) return score;
    }
    return 0.0;
  },
  injectCandidates : function(cand, terminate, notify){
    notify = notify===null)? terminate : notify;
    var text = this.value;
    var word = this.getCurrentWord();
    var suffix = text.substr(word.caret);
    var delimiter = (terminate && suffix.charAt(0) != this.delimiter)? this.delimiter : '';
    this.value = text.substring(0, word.start) + cand + delimiter + suffix;
    this.input.selectionStart = this.input.selectionEnd = word.start + cand.length + delimiter.length;

    this.deleting = false;

    if(terminate){
      this.ensureCursorIsVisible();

      if(notify)
        this.notify();

      var event = document.createEvent('Event');
      event.initEvent('terminate', false, true);
      this.dispatchEvent(event);
    }
  },
  getCurrentWord : function(){
    var text = this.value;
    var caret = this.selectionStart;
    var start = text.lastIndexOf(this.delimiter, caret - 1) + 1;

    return {
      start : start,
      caret : caret,
      hint  : text.slice(start, caret)
    };
  },
  getCandidates : function(hint){
    var cands = [];
    this.candidates.forEach(function(cand){
      var score = this.scoreFor(cand.reading, hint);
      if(score > 0.8) cands.push(cand.value);
    }, this);
    var values = this.value;

    var index = values.indexOf(hint);
    if(~index) values.splice(index, 1);

    return cands.filter(function(cand){
      return !~values.indexOf(cand);
    });
  },
  complete : function(denyEmpty){
    var text = this.value;
    var word = this.getCurrentWord();
    var hint = word.hint;
    if(!hint && denyEmpty){
      this.popup.hidePopup();
      return;
    }
    var cands = this.getCandidates(hint);
    if(this.autoComplete && !this.deleting && cands.length === 1 && (hint.length >= 2 || cands[0].length === 1)){
      this.injectCandidates(cands[0], true);
      this.popup.hidePopup();
      return;
    }
    if(cands.length){
      this.popup.show(this, (this.getCursorLeft(word.start) - this.content.scrollLeft) + this.padding(), -2, cands);
    } else {
      this.popup.hidePopup();
    }
  },
  getCursorLeft : function(pos){
    this.measure.value = this.value.substr(0, pos);
    this.measure.hidden = false;

    var x = this.measure.boxObject.width;
    this.measure.hidden = true;
    return x;
  },
  ensureCursorIsVisible : function(){
    this.content.scrollLeft = this.getCursorLeft(this.selectionStart) - this.input.offsetWidth + 20;
  }
}

var Popup = function(tagPanel){
  this.element = $N('ol'{id:'listbox'});
  this.rowCount = 0;
  this.selectedIndex = 0;
  this.cands = [];
};
Popup.prototype = {
  maxRows : 20,
  cloned : $N('li'),
  createItem : function(cand){
    var clone = this.cloned.cloneNode(false);
    clone.appendChild(cand.value);
    return clone;
  },
  padding : function(){
    return this._padding || (this._padding = Math.ceil(parseFloat(window.getComputedStyle(this,'').paddingTop)));
  }
  enter : function(terminate){
    var item = this.cands[this.selectedIndex];
    if(!item) return;
    this.tagPanel.injectCandidates(item, terminate);

    if(terminate)
      this.hidePopup();
  },
  moveCursor : function(offset){
    var index = this.selectedIndex + offset;
    index = index >= this.rowCount ? 0:
            index < 0              ? (this.rowCount - 1) : index;
    this.selectedIndex = index
    this.ensureIndexIsVisible(index);
  },
  removeAll : function(){
    // range remove
    $D(this.element);
    this.cands = [];
    this.rowCount = 0;
    this.selectedIndex = 0;
  },
  appendItems : function(cands){
    this.cands = cands;
    cands.forEach(function(item){
      this.element.appendChild(this.createItem(item));
    }, this);
    this.rowCount = cands.length;
    this.selectedIndex = 0;
    this.adjustSize();
  },
  adjustSize : function(){
    if(this.rowHeight){
      this.rows = Math.min(this.rowCount, this.maxRows);
    } else {
      this.height = Math.min(this.rowCount, this.maxRows) * this.rowHeight() + (this.padding()*2);
    }
    if(this.rowCount === 1){
      this.style.backgroundColor = '#ccf0ff';
    } else {
      this.style.backgroundColor = '#ffffff';
    }

    if(this.rowCount > this.maxRows && this.rowHeight){
      this.width = null;
      this.width = this.boxObject.width + 20;
    } else {
      this.width = null;
    }
  },
  hidePopup : function(){
  },
  show : function(anchor, x, y, cands){
    if(cands){
      this.removeAll();
      this.appendItems(cands);
    }
  },
  ensureIndexIsVisible : function(index){
  }
}

var Measure = function(tagPanel){
};

var DescriptionBox = function(elm, attr, dialogPanel){
  this.elmBox = $N('textarea', {
    'placeholder':'Description',
    'id':'description',
    'row':(attr.row||4)
  });
  this.counter = $N('p', {'id':'meta'}, '0');
  elm.appendChild(this.elmBox);
  elm.appendChild(this.counter);
  dialogPanel.unload_regist(this);
}

var PostersPanel = function(dialogPanel){
  this.elmPanel = $('posters');
  this.elmButton = $('post');
  this.models = background.Models;
  this.posters = this.models.check(ps);
  var df = $DF();
  this.buttons = this.posters.map(function(poster){
    var img = $N('img', {'src':poster.ICON, 'title':poster.name, 'class':'poster'});
    connect(img, 'onclick', this, function(){
      alert(poster);
    });
    df.appendChild(img);
    return img;
  }, this);
  this.elmPanel.appendChild(df);
  dialogPanel.unload_regist(this);
}
*/
