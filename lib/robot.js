var synccheck = require('./webwx.js').synccheck;
var webwxsync = require('./webwx.js').webwxsync;
var handleMsg = require('./msghandle.js').handleMsg;

function robot(filters, mappers) {
  return (wxSession) => {
    synccheck(wxSession)
    .then(webwxsync(handleMsg(filters, mappers)))
    //.then(botSpeak)
    .then(robot(filters, mappers))
    .catch(console.error);
  }
}

function botSpeak(wxSession) {
  if (!wxSession.webwxsync) {
    return Promise.resolve(wxSession);
  }
  return new Promise((resolve, reject)=>{
    //debug('wxSession in webwxsendmsg:\n' + inspect(wxSession));

    // 整体重新设计, 
    wxSession.MsgToUserAndSend.map((msgBundle)=>{
      webwxsendmsg(msgBundle.Msg, msgBundle.User, wxSession);
    });
    // 重置为[] pop all handled msgs
    // 防止内存泄漏
    wxSession.MsgToUserAndSend = [];
    resolve(wxSession);
  });
}
module.exports.robot = robot;
