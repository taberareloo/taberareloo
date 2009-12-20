// vim: fileencoding=utf-8
// LDR + Taberareloo

(function(){

  function taberareloo(){
    try{
      var feed = get_active_feed();
      var item = get_active_item(true);
      var target = item.element;
      var text = Object.toJSON({
        feed: feed.channel.link
      });
      var ev = document.createEvent('MessageEvent');
      ev.initMessageEvent('Taberareloo.LDR', true, false, text, location.protocol+"//"+location.host, "", window);
      target.dispatchEvent(ev);
    }catch(e){ }
  }

  var id = setTimeout(function(){
    if(id) clearTimeout(id);
    if(typeof Keybind != 'undefined' && typeof entry_widgets != 'undefined') {
      Keybind.add('t', taberareloo);
    } else {
      id = setTimeout(arguments.callee, 100);
    }
  }, 0);

})();

