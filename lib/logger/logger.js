'use strict'

var request = require('request');
var fs = require('fs');
var querystring = require('querystring');
var crypto = require('crypto');
var path = require('path');
var webwxbatchgetcontact = require('../webwx.js').webwxbatchgetcontact;

var MSGTYPE_TEXT = require('../global.js').MSGTYPE_TEXT;
var MSGTYPE_IMAGE = require('../global.js').MSGTYPE_IMAGE;

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


function webwxgetmsgimg(msgId, obj, imgPath){
  var imgUrl = `https://wx.qq.com/cgi-bin/mmwebwx-bin/webwxgetmsgimg?&MsgID=${msgId}&skey=${querystring.escape(obj.BaseRequest.Skey)}`;
  // 保存图片到文件
  try {
    request.get(imgUrl, {jar: true}).pipe(fs.createWriteStream(imgPath));
  } catch (e){
    console.error('下载图像资源失败:', e);
  }
}

function logImageMessage(o, obj) {
  var imgPath = path.join(process.cwd(), 'data/pic', crypto.createHash('md5').update(crypto.randomBytes(10)).digest('hex') + '.jpg');
  webwxgetmsgimg(o.MsgId, obj, imgPath);
  if (o.FromUserName.startsWith("@@")) {
    logGroupImageMsg(o, obj, imgPath);
  } else {
    logPrivateImageMsg(o, obj, imgPath);
  }
}

function logPrivateImageMsg(o, obj, imgPath) {
  var p = handlePrivate(o.FromUserName, 'file://' + imgPath, obj);
  p.then(console.log, console.error);
}

function logGroupImageMsg(o, obj, imgPath) {
  var result = /^(@[^:]+):<br\/>/mg.exec(o.Content);
  if (result) {
    var fromUserName = result[1];
  }
  var p = handleGroup(o.FromUserName, fromUserName + ':<br/>' + 'file://' + imgPath, obj);
  p.then(console.log, console.error);
}

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
  var p = handlePrivate(o.FromUserName, o.Content, obj);
  p.then(console.log, console.error);
}

function handlePrivate(username, replyContent, obj) {
  // 如果没找到，请求啊
  // 查看Object Array中是否有UserName属性为username的Object
  // FIXME_TEST: find替换

  var p = new Promise((resolve, reject)=>{
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
  return p;
}

function logGroupTextMsg(o, obj) {
  var p = handleGroup(o.FromUserName, o.Content, obj);
  p.then(console.log, console.error);
}

function handleGroup(groupUserName, replyContent, obj) {
  var p = new Promise((resolve, reject)=>{
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
  return p;
}


function logNotImplementMsg(o) {
  console.error("未实现消息类型：" + o.MsgType);
}

module.exports.wechatLogger = wechatLogger;
