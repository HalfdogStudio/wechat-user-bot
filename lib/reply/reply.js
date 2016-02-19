'use strict'

var MSGTYPE_TEXT = require('../global.js').MSGTYPE_TEXT;
var reply = require('./dialog.js').turingRobot;
var webwxsendmsg = require('../webwx.js').webwxsendmsg;

function generateReply(wxSession) {
  return o=>{
    var reply;
    switch (o.MsgType) {
        case MSGTYPE_TEXT:
            reply = generateTextMessage(o, wxSession);
            break;
        default:
            generateNotImplementMsg(o, wxSession);
    }
    return reply;
  }
}

function generateTextMessage(o, wxSession) {

  if (o.FromUserName.startsWith("@@") && (o.Content.includes("@" + wxSession.nickname))) {
    // FIXME: 用户名解析
    o.Content = o.Content.replace(/@[^:]+:<br\/>/g, '');
    // FIXME: at 我, 在Username NickName和群的displayName里
    // FIXME: 正则escape
    //o.Content = o.Content.replace(new RegExp('@' + wxSession.nickname), '喂, ');
    o.Content = o.Content.replace(new RegExp('@' + wxSession.nickname), '');
  } else if (o.FromUserName.startsWith("@@")) {
    // 其他群信息则不回复
    return;
  }
  // 过滤符号
  o.Content = o.Content.replace(/<\s*br\s*\/?\s*>/g, '\n');
  // FIXME: 表情符号修正

  // 回复
  var username = o.FromUserName;  // 闭包,防止串号，血泪教训
  var replyPromise = reply(o.Content, o.FromUserName);
  // add then
  replyPromise.then((text)=>{
    webwxsendmsg(text, username, wxSession);
  })
  return o; // transducer if you like, however I won't
}

function generateNotImplementMsg(o) {
  console.error("未实现回复生成类型: " + o.MsgType);
}

module.exports.generateReply = generateReply;
