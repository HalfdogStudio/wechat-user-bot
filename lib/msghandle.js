
var SPECIAL_USERS = require('./global.js').SPECIAL_USERS;

function handleMsg(filters, mappers) {
  return (resolve, addMsgList, obj) => {
    var replys = addMsgList
    .filter(o=>(o.ToUserName === obj.username)) // 过滤不是给我的信息
    .filter(o=>(SPECIAL_USERS.indexOf(o.FromUserName) < 0)); // 不是特殊用户

    filters.forEach(f=> {
      replys = replys.filter(f(obj));
    });

    mappers.push((obj)=>(o)=>Promise.resolve(o));   // 默认mapper，Promise化reply

    mappers.forEach(f=> {
      replys = replys.map(f(obj));
    });

    replys.map(r=>r.catch(console.error));  // 错误捕获

    // get all replys resolved 所有回复完成
    // FIXME: webwxsendmsg似乎会被限制并发和频率，也可能只是微信的网络问题
    // 如果不等all reply Promise完成就继续resolve，replys实现要等到下一个process.nextTick
    // 结果就synccheck有返回新更新才会轮到sendmsg
    Promise.all(replys).then(()=>{
      resolve(obj);   // 在回调中控制权交给resolve函数
    });
  }
}

module.exports.handleMsg = handleMsg;
