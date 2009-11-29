var TagsPanel = function(formPanel, dialogPanel){
  this.candidates = [];
  this.delay = 130;
  this.delimiter = ' ';
  this.container = $N('div', {id: 'container'});
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
  scoreFor : function(toscore, abb){
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
    notify = (notify===null)? terminate : notify;
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
  this.element = $N('ol', {id:'listbox'});
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
  },
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
