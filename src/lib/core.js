// Taberaeloo => TBRL
var TBRL = {
  post : function(ps){
    return Tumblr.post(ps);
  },
  check : function(ctx){
    return Extractors.check(ctx);
  }
}

