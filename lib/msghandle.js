var webwxsendmsg = require('./webwx.js').webwxsendmsg;
var SPECIAL_USERS = require('./global.js').SPECIAL_USERS;

// mapper是回复栈?
function handleMsg(filters, mappers) {
  return (addMsgList, obj) => {
    var replys = addMsgList
    .filter(o=>(o.ToUserName === obj.username)) // 过滤不是给我的信息
    .filter(o=>(SPECIAL_USERS.indexOf(o.FromUserName) < 0)); // 不是特殊用户

    filters.forEach(f=> {
      replys = replys.filter(f(obj));
    });

    mappers.push((obj)=>(o)=>Promise.resolve(o));   // 默认mapper，Promise化reply

    mappers.forEach(f=> {
      replys = replys.map(f(obj));
    });

    // FUcking twisted my head!
    // replys.forEach(msgBundlePromise=>{
    //   msgBundlePromise.then(msgBundle=>{
    //     msgBundle.Msg.then(msg=>{
    //       webwxsendmsg(msg, msgBundle.User, obj);
    //     });
    //   });
    // });

    replys.map(r=>r.catch(console.error));  // 错误捕获
  }
}

module.exports.handleMsg = handleMsg;
