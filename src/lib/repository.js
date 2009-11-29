// like tombloo Repository
var Repository = function(){
  this.list = [];
}
Repository.prototype = {
  clear : function(){
    this.names.forEach(function(name){
      delete this[name];
    }, this);
    this.list = [];
  },
  find : function(name){
    return this.values.filter(function(i){
      return !!~i.name.search(name);
    });
  },
  copyTo : function(t){
    t.list = $A(this.list);
    t.list.forEach(function(def){
      t[def.name] = def;
    });
    return t;
  },
  check : function(){
    var args = arguments;
    return this.values.reduce(function(memo, i){
      if(i.check && i.check.apply(i, args)) memo.push(i);
      return memo;
    }, []);
  },
  register : function(defs, target, after){
    if(!defs) return;
    defs = [].concat(defs);
    if(target){
      var vals = this.values;
      this.clear();
      for(var i = 0, len = vals.length; i < len; ++i){
        if(vals[i].name == target) break;
      }
      vals.splice((after? i+1 : i), 0).concat(defs);
      defs = vals;
    }
    defs.forEach(function(d){
      this.list.push(d);
      this[d.name] = d;
    }, this);
  }
}
Repository.prototype.__defineGetter__('values', function(){
    return this.list.filter(function(i){ return i.name });
});
Repository.prototype.__defineGetter__('names', function(){
    return this.values().map(itemgetter('name'));
});
Repository.prototype.__defineGetter__('size', function(){
    return this.values().length;
});

