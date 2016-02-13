'use strict'

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



module.exports.cacheContact = cacheContact;
