## 架构

总体如下

```bash
..[reverland@reverland-R478-R429] - [~/wx/wechat-user-bot] - [四  2月 18, 04:35]
..[$] <( (git)-[master]-)> tree -I "node_modules|data" .
.
├── config
│   └── apikeys.js
├── index.js
├── lib
│   ├── cache.js
│   ├── global.js
│   ├── logger
│   │   └── logger.js
│   ├── msghandle.js
│   ├── reply
│   │   ├── dialog.js
│   │   └── reply.js
│   ├── robot.js
│   └── webwx.js
```

### index.js: 入口文件

用串联的Promise构建起整个程序，wxSession在其中传递。

### apikeys.js: api文件

如果使用图灵机器人，需要自行申请图灵机器人的API，保存到`apikeys.js`文件内：

    module.exports.turingRobotApiKey = '你申请的key';

也可以在`dialog.js`里实现自己的对话系统，请参照源码。

### logger/logger.js: 消息记录

```javascript
function wechatLogger(wxSession) {
  return o=>{
    // 对每一条MsgAddList对象o
    return o;
  }
}
```

### reply/reply.js: 消息回复

传递给msghandle的transducer，接受wxSeesion，返回一个接受一个参数的函数。

```javascript
function generateReply(wxSession) {
  return o=>{
    // o： 每个addMsgList中对象经过一些列transducer消息处理后的对象
    // 根据o回复消息
    return something;    // 传递给下一个transducer的对象
  }
}

### reply/dialog.js: 对话引擎

每个对话引擎实现为一个函数`dialog`：

```javascript
function dialog(content, userid) {
    // 处理content
    // ...
    return Promise.resolve(newContent);
}
```
### msghandle.js: 消息处理

接受filter列表和transducer列表
返回接受addMsgList和wxSession的函数

内置某些filter和Promise化 transducer。

```javascript
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

### cache.js: 更新联系人信息缓存

### global.js: 变量声明


### robot.js: 定义机器人

### webwx.js: web微信基础函数
