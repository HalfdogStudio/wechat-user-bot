'use strict'

function cacheContact(modContactList, obj) {
  modContactList.forEach(o=>{
    if (o.UserName.startsWith('@@')) {  // 群组直接替换了
      // console.log('群缓存更新', o.NickName)
      obj.groupContact[o.UserName] = {
        nickName: o.NickName,
        memberList: o.MemberList,
      }
    } else {  // 用户
      // 如果不在缓存中
      var index = obj.memberList.findIndex(user=> user['UserName'] == o.UserName);
      if (index < 0) {
        // console.log('用户缓存推入', o.NickName)
        obj.memberList.push(o);
      } else {
        // console.log('用户缓存替换', o.NickName)
        obj.memberList[index] = o;
      }
    }
  });
}



module.exports.cacheContact = cacheContact;
