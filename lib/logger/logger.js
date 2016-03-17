'use strict'
var inspect = require('util').inspect
var request = require('request');
var path = require('path');
var fs = require('fs');
var webwxbatchgetcontact = require('../webwx.js').webwxbatchgetcontact;
var webwxgetmsgimg = require('../webwx.js').webwxgetmsgimg;
var webwxgetvoice = require('../webwx.js').webwxgetvoice;
var webwxgetvideo = require('../webwx.js').webwxgetvideo;
var webwxgetemoticon = require('../webwx.js').webwxgetemoticon;
var webwxgetmedia = require('../webwx.js').webwxgetmedia;

var MSGTYPE_TEXT = require('../global.js').MSGTYPE_TEXT;
var MSGTYPE_IMAGE = require('../global.js').MSGTYPE_IMAGE;
var MSGTYPE_VOICE = require('../global.js').MSGTYPE_VOICE;
var MSGTYPE_VIDEO = require('../global.js').MSGTYPE_VIDEO;
var MSGTYPE_MICROVIDEO = require('../global.js').MSGTYPE_MICROVIDEO;
var MSGTYPE_EMOTICON = require('../global.js').MSGTYPE_EMOTICON;
var MSGTYPE_APP = require('../global.js').MSGTYPE_APP;

var convertEmoji = require('../util.js').convertEmoji;

/* 目录检查 */
(function checkDir(dirs) {
  dirs.forEach(d=>{
    var dirPath = path.join(process.cwd(), d);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath);
    }
  })
})([
  'data/',
  'data/pic',
  'data/voice',
  'data/video',
  'data/msglog',
  'data/emoticon',
  'data/file'
]);

var winston = require('winston');

var logger = new (winston.Logger)({
    level: 'info',
    transports: [
      new (winston.transports.Console)(),
      new (winston.transports.File)( { filename: path.join(process.cwd(), `data/msglog/${Date.now()}.log`) } )
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
            logMultimediaMessage(o, wxSession, webwxgetmsgimg, 'data/pic');
            break;
        case MSGTYPE_VOICE:
            logMultimediaMessage(o, wxSession, webwxgetvoice, 'data/voice');
            break;
        case MSGTYPE_VIDEO:
        case MSGTYPE_MICROVIDEO:
            logMultimediaMessage(o, wxSession, webwxgetvideo, 'data/video');
            break;
        case MSGTYPE_EMOTICON:
            logEmoticonMessage(o, wxSession, webwxgetemoticon, 'data/emoticon')
            break;
        case MSGTYPE_APP:
            if (o.AppMsgType == 6) {
              logMultimediaMessage(o, wxSession, webwxgetmedia, 'data/file')
              break;
            }
        default:
            logNotImplementMsg(o, wxSession, "wechatLogger");
    }
    return o;
  }
}

/*
 * 表情
 */

function logEmoticonMessage(o, wxSession, apiFunc, dirPath) {
  var emoticonPath = path.join(process.cwd(), dirPath, o.MsgId);
  apiFunc(o, wxSession, emoticonPath)
  .then((emoticonPath) => {
    if (o.FromUserName.startsWith("@@")) {
      logGroupEmoticonMsg(o, wxSession, emoticonPath);
    } else {
      logPrivateEmoticonMsg(o, wxSession, emoticonPath);
    }
  }).catch((e)=>{
    logger.error(`[logEmoticonMessage]${e} ${inspect(o)}`);
  })
}

function logPrivateEmoticonMsg(o, wxSession, emoticonPath) {
  handlePrivate(o.FromUserName, 'file://' + emoticonPath, wxSession)
  .then(logger.info, logger.error);
}

function logGroupEmoticonMsg(o, wxSession, emoticonPath) {
  var result = /^(@[^:]+):<br\/>/mg.exec(o.Content);
  if (result) {
    var fromUserName = result[1];
  }
  handleGroup(o.FromUserName, `${fromUserName}:<br/>file://${emoticonPath}`, wxSession)
  .then(logger.info, logger.error);
}


/*
 * 多媒体记录
 */

function logMultimediaMessage(o, wxSession, apiFunc, dirPath) {
  var multimediaPath = path.join(process.cwd(), dirPath, o.MsgId);
  apiFunc(o, wxSession, multimediaPath)
  .then((multimediaPath) => {
    if (o.FromUserName.startsWith("@@")) {
      logGroupMultimediaMsg(o, wxSession, multimediaPath);
    } else {
      logPrivateMultimediaMsg(o, wxSession, multimediaPath);
    }
  })
}

function logPrivateMultimediaMsg(o, wxSession, multimediaPath) {
  handlePrivate(o.FromUserName, 'file://' + multimediaPath, wxSession)
  .then(logger.info, logger.error);
}

function logGroupMultimediaMsg(o, wxSession, multimediaPath) {
  var result = /^(@[^:]+):<br\/>/mg.exec(o.Content);
  if (result) {
    var fromUserName = result[1];
  }
  handleGroup(o.FromUserName, `${fromUserName}:<br/>file://${multimediaPath}`, wxSession)
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
      resolve(convertEmoji(`[${m.NickName}说]${replyContent.replace(/<br ?[^><]*\/?>/g, "")}`));
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
      resolve(convertEmoji(`[${groupRealName}]${m.NickName}${replyContent.replace(fromUserName, '').replace(/<br ?[^><]*\/?>/g, "")}`));
    }

  });
}

/*
 * 未实现
 */

function logNotImplementMsg(o, wxSession, context) {
  logger.error(`[${context}]未实现消息类型：${o.MsgType}`);
}

module.exports.wechatLogger = wechatLogger;
