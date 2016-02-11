var synccheck = require('./webwx.js').synccheck;
var webwxsync = require('./webwx.js').webwxsync;
var webwxsendmsg = require('./webwx.js').webwxsendmsg;
var handleMsg = require('./msghandle.js').handleMsg;

function robot(filters, mappers) {
  return (obj) => {
    synccheck(obj)
    .then(webwxsync(handleMsg(filters, mappers)))
    .then(botSpeak)
    .then(robot(filters, mappers))
    .catch(console.error);
  }
}

function botSpeak(obj) {
  if (!obj.webwxsync) {
    return Promise.resolve(obj);
  }
  return new Promise((resolve, reject)=>{
    //debug('obj in webwxsendmsg:\n' + inspect(obj));

    // 整体重新设计, 
    obj.MsgToUserAndSend.map((msgBundle)=>{
      webwxsendmsg(msgBundle.Msg, msgBundle.User, obj);
    });
    // 重置为[] pop all handled msgs
    // 防止内存泄漏
    obj.MsgToUserAndSend = [];
    resolve(obj);
  });
}
module.exports.robot = robot;
