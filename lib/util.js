'use strict'

var webwxsendmsg = require('./webwx.js').webwxsendmsg;
var SPECIAL_USERS = require('./global.js').SPECIAL_USERS;


/**
 * 缓存通讯录
 * @param {Object} modContactList - modContactList对象
 * @param {Object} wxSession - 微信会话
 */
function cacheContact(modContactList, wxSession) {
  modContactList.forEach(o=>{
    if (o.UserName.startsWith('@@')) {  // 群组直接替换了
      // console.log('群缓存更新', o.NickName)
      wxSession.groupContact[o.UserName] = {
        nickName: o.NickName,
        memberList: o.MemberList,
      }
    } else {  // 用户
      // 如果不在缓存中
      var index = wxSession.memberList.findIndex(user=> user['UserName'] == o.UserName);
      if (index < 0) {
        // console.log('用户缓存推入', o.NickName)
        wxSession.memberList.push(o);
      } else {
        // console.log('用户缓存替换', o.NickName)
        wxSession.memberList[index] = o;
      }
    }
  });
}


/*
 * 消息处理
 * @param {Array} filter - 过滤
 * @param {Array} transducers - 并行处理
 * @return {Function} - 接受addMsgList和wxSession的函数
 */
function handleMsg(filters, transducers) {
  return (addMsgList, wxSession) => {
    var replys = addMsgList
    .filter(o=>(o.ToUserName === wxSession.username)) // 过滤不是给我的信息
    .filter(o=>(SPECIAL_USERS.indexOf(o.FromUserName) < 0)); // 不是特殊用户

    filters.forEach(f=> {
      replys = replys.filter(f(wxSession));
    });

    transducers.push((wxSession)=>(o)=>Promise.resolve(o));   // 默认transducers，Promise化reply

    transducers.forEach(f=> {
      replys = replys.map(f(wxSession));
    });

    replys.map(r=>r.catch(console.error));  // 错误捕获
  }
}

/*
 * emoji处理
 * @param {String} - 待转换emoji文本
 * @return {String} - 处理后的文本
 * FIXME: 检查该函数
 */
function convertEmoji(s) {
  return s.replace(/<span.*?class="emoji emoji(.*?)"><\/span>/g, (a, b) => {
    try {
      let s = null
      if (b.length == 4 || b.length == 5) {
        s = ['0x' + b]
      } else if (b.length == 8) {
        s = ['0x' + b.slice(0, 4), '0x' + b.slice(4, 8)]
      } else if (b.length == 10) {
        s = ['0x' + b.slice(0, 5), '0x' + b.slice(5, 10)]
      } else {
        throw new Error('unknown emoji characters')
      }
      return String.fromCodePoint.apply(null, s)
    } catch (err) {
      error(b, err)
    }
  })
} 

module.exports.cacheContact = cacheContact;
module.exports.handleMsg = handleMsg;
module.exports.convertEmoji = convertEmoji;
