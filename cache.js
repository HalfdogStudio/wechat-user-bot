'use strict'

function cacheContact(modContactList, obj) {
  for (var o of modContactList) {
    if (o.UserName.startsWith('@@')) {  // 群组
      obj.groupContact[o.UserName] = {
        nickName: o.NickName,
        memberList: o.MemberList,
      }
    } else {  // 用户
      // 查找与替换
      var length = obj.memberList.length
      let find = false;
      for (let i = 0; i < length; i++) {
        let user = obj.memberList[i];
        if (user['UserName'] == o.UserName) {
          obj.memberList[i] = o;
          find = true;
          break;
        } 
      }
      // 如果没有找到
      if (!find) {
        obj.memberList.push(o);
      }
    }
  }
}

module.exports.cacheContact = cacheContact;
