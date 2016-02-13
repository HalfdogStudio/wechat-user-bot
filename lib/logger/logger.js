'use strict'

var request = require('request');
var path = require('path');
var webwxbatchgetcontact = require('../webwx.js').webwxbatchgetcontact;
var webwxgetmsgimg = require('../webwx.js').webwxgetmsgimg;

var MSGTYPE_TEXT = require('../global.js').MSGTYPE_TEXT;
var MSGTYPE_IMAGE = require('../global.js').MSGTYPE_IMAGE;

(function checkDir() {
  var picDir = path.join(process.cwd(), 'data/pic');
  if (!fs.existsSync(picDir)) {
    fs.mkdirSync(picDir);
  }
})();

/*
 * logger函数，
 * @param: 会话对象
 */

function wechatLogger(obj) {
  return o=>{
    // 对没一条MsgAddList对象o
    switch (o.MsgType) {
        case MSGTYPE_TEXT:
            logTextMessage(o, obj)
            break;
        case MSGTYPE_IMAGE:
            logImageMessage(o, obj)
            break;
        default:
            logNotImplementMsg(o, obj);
    }
    return o;
  }
}


/*
 * 图像记录
 */

function logImageMessage(o, obj) {
  var imgPath = path.join(process.cwd(), 'data/pic', o.MsgId + '.jpg');
  webwxgetmsgimg(o.MsgId, obj, imgPath);
  if (o.FromUserName.startsWith("@@")) {
    logGroupImageMsg(o, obj, imgPath);
  } else {
    logPrivateImageMsg(o, obj, imgPath);
  }
}

function logPrivateImageMsg(o, obj, imgPath) {
  handlePrivate(o.FromUserName, 'file://' + imgPath, obj)
  .then(console.log, console.error);
}

function logGroupImageMsg(o, obj, imgPath) {
  var result = /^(@[^:]+):<br\/>/mg.exec(o.Content);
  if (result) {
    var fromUserName = result[1];
  }
  handleGroup(o.FromUserName, fromUserName + ':<br/>' + 'file://' + imgPath, obj)
  .then(console.log, console.error);
}

/*
 * 文本记录
 */

function logTextMessage(o, obj) {
  //debug("in webwxsync someone call me:" + inspect(o));
  // 查询用户名昵称
  if (o.FromUserName.startsWith("@@")) {
    logGroupTextMsg(o, obj);
  } else {
    logPrivateTextMsg(o, obj);
  }
}

function logPrivateTextMsg(o, obj) {
  handlePrivate(o.FromUserName, o.Content, obj)
  .then(console.log, console.error);
}

function logGroupTextMsg(o, obj) {
  handleGroup(o.FromUserName, o.Content, obj)
  .then(console.log, console.error);
}

/*
 * 群组或用户信息处理
 */

function handlePrivate(username, replyContent, obj) {
  return new Promise((resolve, reject)=>{
    if (obj.memberList.findIndex(m=>m['UserName']==username) < 0) { 
      // memberList中不存在
      var contactP = webwxbatchgetcontact(username, obj);
    } else {
      var contactP = Promise.resolve(obj);
    }

    contactP.then(_logPrivateTextMsg).catch(reject);

    function _logPrivateTextMsg(obj) {
      var m = obj.memberList.find(m=>m.UserName==username);
      resolve("[" + m.NickName + "说]" + replyContent);
    }
  });
}


function handleGroup(groupUserName, replyContent, obj) {
  return new Promise((resolve, reject)=>{
    // debug("groupUserName:" + groupUserName);
    // debug("replyContent: " + replyContent);
    var result = /^(@[^:]+):<br\/>/mg.exec(replyContent);
    if (result) {
      var fromUserName = result[1];
    }
    // 查看是否缓存中有
    if (!(groupUserName in obj.groupContact)) {
      var contactP = webwxbatchgetcontact(groupUserName, obj)
    } else {
      var contactP = Promise.resolve(obj);
    }

    contactP.then(_logGroupTextMsg);
    // 记录群消息函数
    function _logGroupTextMsg(obj) {
      var groupRealName = obj.groupContact[groupUserName]['nickName'];
      var m = obj.groupContact[groupUserName]['memberList'].find(m=>m.UserName==fromUserName)
      resolve("[" + groupRealName + "]" + m.NickName + replyContent.replace(fromUserName, '').replace("<br/>", ""));
    }

  });
}

/*
 * 未实现
 */

function logNotImplementMsg(o) {
  console.error("未实现消息类型：" + o.MsgType);
}

module.exports.wechatLogger = wechatLogger;
