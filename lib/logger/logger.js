'use strict'
var request = require('request');
var path = require('path');
var fs = require('fs');
var webwxbatchgetcontact = require('../webwx.js').webwxbatchgetcontact;
var webwxgetmsgimg = require('../webwx.js').webwxgetmsgimg;
var webwxgetvoice = require('../webwx.js').webwxgetvoice;

var MSGTYPE_TEXT = require('../global.js').MSGTYPE_TEXT;
var MSGTYPE_IMAGE = require('../global.js').MSGTYPE_IMAGE;
var MSGTYPE_VOICE = require('../global.js').MSGTYPE_VOICE;

/* 目录检查 */
(function checkDir() {
  var dataDir = path.join(process.cwd(), 'data/')
  var picDir = path.join(process.cwd(), 'data/pic');
  var voiceDir = path.join(process.cwd(), 'data/voice');
  var msglogDir = path.join(process.cwd(), 'data/msglog');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }
  if (!fs.existsSync(picDir)) {
    fs.mkdirSync(picDir);
  }
  if (!fs.existsSync(voiceDir)) {
    fs.mkdirSync(voiceDir);
  }
  if (!fs.existsSync(msglogDir)) {
    fs.mkdirSync(msglogDir);
  }
})();

var winston = require('winston');

var logger = new (winston.Logger)({
    level: 'info',
    transports: [
      new (winston.transports.Console)(),
      new (winston.transports.File)( { filename: path.join(process.cwd(), 'data/msglog/' + Date.now() + '.log') } )
    ]
  });

/*
 * logger函数，
 * @param: 会话对象
 */

function wechatLogger(wxSession) {
  return o=>{
    // 对每一条MsgAddList对象o
    switch (o.MsgType) {
        case MSGTYPE_TEXT:
            logTextMessage(o, wxSession)
            break;
        case MSGTYPE_IMAGE:
            logImageMessage(o, wxSession)
            break;
        case MSGTYPE_VOICE:
            logVoiceMessage(o, wxSession)
            break;
        default:
            logNotImplementMsg(o, wxSession);
    }
    return o;
  }
}

/*
 * 音频记录
 */

function logVoiceMessage(o, wxSession) {
  var voicePath = path.join(process.cwd(), 'data/voice', o.MsgId + '.mp3');
  webwxgetvoice(o.MsgId, wxSession, voicePath);
  if (o.FromUserName.startsWith("@@")) {
    logGroupImageMsg(o, wxSession, voicePath);
  } else {
    logPrivateImageMsg(o, wxSession, voicePath);
  }
}

function logPrivateImageMsg(o, wxSession, voicePath) {
  handlePrivate(o.FromUserName, 'file://' + voicePath, wxSession)
  .then(logger.info, logger.error);
}

function logGroupImageMsg(o, wxSession, voicePath) {
  var result = /^(@[^:]+):<br\/>/mg.exec(o.Content);
  if (result) {
    var fromUserName = result[1];
  }
  handleGroup(o.FromUserName, fromUserName + ':<br/>' + 'file://' + voicePath, wxSession)
  .then(logger.info, logger.error);
}


/*
 * 图像记录
 */

function logImageMessage(o, wxSession) {
  var imgPath = path.join(process.cwd(), 'data/pic', o.MsgId + '.jpg');
  webwxgetmsgimg(o.MsgId, wxSession, imgPath);
  if (o.FromUserName.startsWith("@@")) {
    logGroupImageMsg(o, wxSession, imgPath);
  } else {
    logPrivateImageMsg(o, wxSession, imgPath);
  }
}

function logPrivateImageMsg(o, wxSession, imgPath) {
  handlePrivate(o.FromUserName, 'file://' + imgPath, wxSession)
  .then(logger.info, logger.error);
}

function logGroupImageMsg(o, wxSession, imgPath) {
  var result = /^(@[^:]+):<br\/>/mg.exec(o.Content);
  if (result) {
    var fromUserName = result[1];
  }
  handleGroup(o.FromUserName, fromUserName + ':<br/>' + 'file://' + imgPath, wxSession)
  .then(logger.info, logger.error);
}

/*
 * 文本记录
 */

function logTextMessage(o, wxSession) {
  //debug("in webwxsync someone call me:" + inspect(o));
  // 查询用户名昵称
  if (o.FromUserName.startsWith("@@")) {
    logGroupTextMsg(o, wxSession);
  } else {
    logPrivateTextMsg(o, wxSession);
  }
}

function logPrivateTextMsg(o, wxSession) {
  handlePrivate(o.FromUserName, o.Content, wxSession)
  .then(logger.info, logger.error);
}

function logGroupTextMsg(o, wxSession) {
  handleGroup(o.FromUserName, o.Content, wxSession)
  .then(logger.info, logger.error);
}

/*
 * 群组或用户信息处理
 */

function handlePrivate(username, replyContent, wxSession) {
  return new Promise((resolve, reject)=>{
    if (wxSession.memberList.findIndex(m=>m['UserName']==username) < 0) { 
      // memberList中不存在
      var contactP = webwxbatchgetcontact(username, wxSession);
    } else {
      var contactP = Promise.resolve(wxSession);
    }

    contactP.then(_logPrivateTextMsg).catch(reject);

    function _logPrivateTextMsg(wxSession) {
      var m = wxSession.memberList.find(m=>m.UserName==username);
      resolve("[" + m.NickName + "说]" + replyContent);
    }
  });
}


function handleGroup(groupUserName, replyContent, wxSession) {
  return new Promise((resolve, reject)=>{
    // debug("groupUserName:" + groupUserName);
    // debug("replyContent: " + replyContent);
    var result = /^(@[^:]+):<br\/>/mg.exec(replyContent);
    if (result) {
      var fromUserName = result[1];
    }
    // 查看是否缓存中有
    if (!(groupUserName in wxSession.groupContact)) {
      var contactP = webwxbatchgetcontact(groupUserName, wxSession)
    } else {
      var contactP = Promise.resolve(wxSession);
    }

    contactP.then(_logGroupTextMsg);
    // 记录群消息函数
    function _logGroupTextMsg(wxSession) {
      var groupRealName = wxSession.groupContact[groupUserName]['nickName'];
      var m = wxSession.groupContact[groupUserName]['memberList'].find(m=>m.UserName==fromUserName)
      resolve("[" + groupRealName + "]" + m.NickName + replyContent.replace(fromUserName, '').replace("<br/>", ""));
    }

  });
}

/*
 * 未实现
 */

function logNotImplementMsg(o) {
  logger.error("未实现消息类型：" + o.MsgType);
}

module.exports.wechatLogger = wechatLogger;
