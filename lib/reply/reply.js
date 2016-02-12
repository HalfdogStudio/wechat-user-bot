'use strict'

var MSGTYPE_TEXT = require('../global.js').MSGTYPE_TEXT;
var reply = require('./dialog.js').turingRobot;

function generateReplys(obj) {
  return o=>{
    var replys;
    switch (o.MsgType) {
        case MSGTYPE_TEXT:
            replys = generateTextMessage(o, obj);
            break;
        default:
            generateNotImplementMsg(o, obj);
    }
    return replys;
  }
}

function generateTextMessage(o, obj, resolve, reject) {
  var ps = [];

  if (o.FromUserName.startsWith("@@") && (o.Content.includes("@" + obj.nickname))) {
    // FIXME: 用户名解析
    o.Content = o.Content.replace(/@[^:]+:<br\/>/g, '');
    // FIXME: at 我, 在Username NickName和群的displayName里
    // FIXME: 正则escape
    o.Content = o.Content.replace(new RegExp('@' + obj.nickname), '喂, ');
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
  replyPromise.then(rep=>{
    // debug("in ps reps promise:" + inspect(username))
    // debug("in ps reps promise:" + inspect(rep))
    obj.MsgToUserAndSend.push({
      User: username,
      Msg: rep,
    });
  });
  ps.push(replyPromise);
}

function generateNotImplementMsg(o) {
  console.error("未实现回复生成类型: " + o.MsgType);
}

module.exports.generateReplys = generateReplys;
