var webwxsendmsg = require('./webwx.js').webwxsendmsg;
var SPECIAL_USERS = require('./global.js').SPECIAL_USERS;

// transducers作为转换器,虽然一般也是当foreach用
function handleMsg(filters, transducers) {
  return (addMsgList, wxSession) => {
    var replys = addMsgList
    .filter(o=>(o.ToUserName === wxSession.username)) // 过滤不是给我的信息
    .filter(o=>(SPECIAL_USERS.indexOf(o.FromUserName) < 0)); // 不是特殊用户

    filters.forEach(f=> {
      replys = replys.filter(f(wxSession));
    });

    transducers.push((wxSession)=>(o)=>Promise.resolve(o));   // 默认transducers，Promise化reply

    transducers.forEach(f=> {
      replys = replys.map(f(wxSession));
    });

    replys.map(r=>r.catch(console.error));  // 错误捕获
  }
}

module.exports.handleMsg = handleMsg;
