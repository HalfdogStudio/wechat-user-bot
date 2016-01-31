'use strict'

var request = require('request');

var MSGTYPE_TEXT = require('./global.js').MSGTYPE_TEXT;

function wechatLogger(obj) {
  return o=>{
    // 对没一条MsgAddList对象o
    switch (o.MsgType) {
        case MSGTYPE_TEXT:
            logTextMessage(o, obj)
            break;
        default:
            logNotImplementMsg(o, obj);
    }
    return o;
  }
}

function logTextMessage(o, obj) {
  //debug("in webwxsync someone call me:" + inspect(o));
  // 查询用户名昵称
  if (o.FromUserName.startsWith("@@")) {
    logGroupMsg(o, obj);
  } else {
    logPrivateMsg(o, obj);
  }
}
function logPrivateMsg(o, obj) {
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
      var contactP = _requestUserInfo(username, obj);
    } else {
      var contactP = Promise.resolve(obj);
    }

    contactP.then(_logPrivateTextMsg).catch(reject);

    function _logPrivateTextMsg(obj) {
      // FIXME_TEST: 用find替换
      var m = obj.memberList.find(m=>m.UserName==username);
      resolve("[" + m.NickName + "说]" + replyContent);
    }

    function _requestUserInfo(username, obj) {
      return new Promise((resolve, reject)=>{
        var postData = {
          BaseRequest: obj.BaseRequest,
          Count: 1,
          List: [
            {
              UserName: username,
              EncryChatRoomId: "",
            }
          ]
        };
        // console.log("为啥Promise里看不到运行情况")
        request.post(`https://wx.qq.com/cgi-bin/mmwebwx-bin/webwxbatchgetcontact`,
                     {
                       qs: {
                         type: 'ex',
                         r: Date.now(),
                       },
                       body: postData,
                       json: true,
                       jar: true,
                     },
                     (error, response, body)=> {
                       //console.log(body);
                       if (error) {
                         reject(error)
                       }
                       if (body.BaseResponse.Ret != 0) {
                         reject(body.BaseResponse.ErrMsg);
                       }
                       var user = body.ContactList[0]
                       obj.memberList.push(user);
                       resolve(obj);
                     });
      });
    }
  });
  return p;
}


function logGroupMsg(o, obj) {
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
      var contactP = _requestGroupInfo(groupUserName, obj)
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

    function _requestGroupInfo(groupUserName, obj) {
      return new Promise((resolve, reject)=>{
        var postData = {
          BaseRequest: obj.BaseRequest,
          Count: 1,
          List: [
            {
              UserName: groupUserName,
              EncryChatRoomId: "",
            }
          ]
        };
        request.post(`https://wx.qq.com/cgi-bin/mmwebwx-bin/webwxbatchgetcontact`,
                     {
                       qs: {
                         type: 'ex',
                         r: Date.now(),
                       },
                       body: postData,
                       json: true,
                       jar: true,
                     },
                     (error, response, body)=> {
                       //console.log(body);
                       if (error) {
                         reject(error)
                       }
                       if (body.BaseResponse.Ret != 0) {
                         reject(body.BaseResponse.ErrMsg);
                       }
                       var group = body.ContactList[0]
                       var groupRealName = group.NickName;
                       var memberList = group.MemberList;
                       obj.groupContact[groupUserName] = {
                         memberList: memberList,
                         nickName: groupRealName, 
                       };
                       resolve(obj);
                     });    // request
      });   //promise
    }
  });
  return p;

}

function logNotImplementMsg(o) {
  console.error("log not implement msg type: " + o.MsgType);
}

module.exports.wechatLogger = wechatLogger;
