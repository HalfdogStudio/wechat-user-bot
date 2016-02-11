'use strict';
var debug = (text)=>console.error("[DEBUG]", text);
var inspect = require('util').inspect;
var request = require('request');

var querystring = require('querystring');
var fs = require('fs');

var cacheContact = require('./cache.js').cacheContact;

var SPECIAL_USERS = require('./global.js').SPECIAL_USERS;

var getUUID = new Promise((resolve, reject)=>{
  var param = {
    appid: 'wx782c26e4c19acffb',
    fun: 'new',
    redirect_uri: 'https://wx.qq.com/cgi-bin/mmwebwx-bin/webwxnewloginpage',
    lang: 'en_US',
    _: Date.now()
  }

  var uri = '/jslogin';

  //debug(uri);

  var options = {
    uri: uri,
    baseUrl: 'https://login.weixin.qq.com',
    method: 'GET',
    qs: param,
  };

  var req = request(options, (error, response, body)=>{
    if (error) {
      //debug(error);
      reject(error);
    }
    resolve(body);
  });
});

function checkAndParseUUID(text) {
  var result = /window.QRLogin.code = (\d+); window.QRLogin.uuid = "([^"]+)";/.exec(text);
  //debug("checkAndParseUUID");
  if (!result || result[1] != '200') {
    return false;
  }
  return result[2];
}

function showQRImage(display) {
  return (uuid) => {
    console.log("请扫描二维码并确认登录，关闭二维码窗口继续...");
    var QRUrl = 'https://login.weixin.qq.com/qrcode/' + uuid + '?';
    var param = {
      t: 'webwx',
      '_': Date.now()
    }
    //debug(QRUrl + querystring.stringify(param))

    var checkLoginPromise = new Promise((resolve, reject)=> {
      display.on('exit', sessionStop);
      var req = request(QRUrl, {qs: param});
      req.on('response', ()=>{
        resolve({
          uuid: uuid,
          display: display, // 将display传递下去
          tip: 1, //标识
        });
      })
      req.pipe(display.stdin);
    });

    return checkLoginPromise;
    // 登录
  }
}

// 408 408 408 ... 201 ..408 .. 200 ok
function checkLogin(obj) {
  var timestamp = ~Date.now();
  
  var uuid = obj.uuid;
  var display = obj.display;
  // 检查登录和跳转
  return new Promise((resolve, reject)=> {
    var checkUrl = `https://login.weixin.qq.com/cgi-bin/mmwebwx-bin/login?tip=${obj.tip}&uuid=${uuid}&r=${timestamp}` 
    request(checkUrl,
            (error, response, body)=>{
              if (error) {
                reject(error);
              }
              //debug("in checkLogin: " + body);
              if (/window\.code=200/.test(body)) {
                console.log("登录微信...");
                // 删除退出子进程杀掉主进程的回调
                display.removeListener('exit', sessionStop)
                display.kill();
                resolve(body);
              } else if(/window\.code=201/.test(body)){
                obj.tip = 0;  // 第一次之后tip都为0，不然下一个请求不是长连接
                // NOTE: 在这里我试了一会儿
                // 关键是对promise的理解。
                // !! 总结！！
                console.log("已扫描，请点击确认登录");
                resolve(checkLogin(obj)); 
              } else if(/window\.code=408/.test(body)){
                resolve(checkLogin(obj));
              } else {
                console.log("验证码超时...")
                display.kill();
                sessionStop(1);
              }
            });
  });
}

function parseRedirectUrl(text) {
  var result = /window\.redirect_uri="([^"]+)";/.exec(text);
  // debug("parse redirect_uri: " + inspect(result));
  if (!result) {
    console.log("无重定向地址");
    sessionStop(1);
  }
  return result[1]
}

function login(redirectUrl) {
  //debug("redirectUrl in login:" + redirectUrl);
  return new Promise((resolve, reject)=> {
    request.get({
      url: redirectUrl,
      jar: true,
      followRedirect: false,
    }, (error, response, body)=>{
      // server set cookie here，之后的操作需要cookie
      if (error) {
        reject(error);
      }
      resolve(body);
    })
  });
}

function getbaseRequest(text) {
  ////debug("getbaseRequest： " + text)
  var skey = new RegExp('<skey>([^<]+)</skey>');
  var wxsid = new RegExp('<wxsid>([^<]+)</wxsid>');
  var wxuin = new RegExp('<wxuin>([^<]+)</wxuin>');
  var pass_ticket = new RegExp('<pass_ticket>([^<]+)</pass_ticket>');
  // dirty hack
  var skey = skey.exec(text);
  var wxsid = wxsid.exec(text);
  var wxuin = wxuin.exec(text);
  var pass_ticket = pass_ticket.exec(text);

  var returnVal =  {
    BaseRequest: {
      Skey: skey[1],
      Sid: wxsid[1],
      Uin: wxuin[1],
      DeviceID: 'e' + ('' + Math.random().toFixed(15)).substring(2, 17)
    }, 
    pass_ticket: pass_ticket[1],
  }
  //debug("returnVal: \n" + inspect(returnVal))

  return returnVal;
}

function webwxinit(obj) {
  console.log("登录成功，初始化");
  // 参见uproxy_wechat，使用面向对象的方式实现变量传递
  obj.groupContact = Object.create(null);
  obj.MsgToUserAndSend = [];
  return new Promise((resolve, reject)=> {
    //debug("in webwxinit obj:\n" + inspect(obj));
    var postData = {BaseRequest: obj.BaseRequest};
    //debug("in webwxinit postData: " + postData);
    var timestamp = Date.now();
    var options = {
      baseUrl: 'https://wx.qq.com',
      uri: `/cgi-bin/mmwebwx-bin/webwxinit?lang=en_US&pass_ticket=${obj.pass_ticket}`,
      method: 'POST',
      body: postData,
      json: true,
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
      },
      jar: true,
    } 
    var req = request(options, (error, response, body) => {
      if (error) {
        reject(error);
      }
      //debug("In webwxinit body: " + inspect(body));
      // fs.writeFile('init.json', JSON.stringify(body));
      obj.username = body['User']['UserName'];
      obj.nickname = body['User']['NickName'];
      obj.SyncKey = body['SyncKey'];
      //debug("My username: " + obj.username)
      resolve(obj);
    })
  });
}


function getContact(obj) {
  console.log("初始化成功，获取联系人...")
  return new Promise((resolve, reject)=> {
    //debug('in getContact: \n' + inspect(obj));
    var skey = obj.BaseRequest.Skey;
    var pass_ticket = obj.pass_ticket;
    // var jsonFile = fs.createWriteStream('contact.json');
    var timestamp = Date.now();
    var options = {
      baseUrl: 'https://wx.qq.com',
      uri: `/cgi-bin/mmwebwx-bin/webwxgetcontact?lang=en_US&pass_ticket=${pass_ticket}&skey=${skey}&seq=0&r=${timestamp}`,
      method: 'GET',
      json: true,
      jar: true,
    }
    //debug("getContact contactUrl: \n" + inspect(options));
    // FIXME: 重新设计缓存机制
    request(options, (error, response, body)=>{
      // fs.writeFile('contact.json', JSON.stringify(body));
      obj.memberList = body.MemberList;
      //obj.toUser = memberList.filter(m=>(m.NickName == "核心活动都是玩玩玩吃吃吃的北邮GC"))[0]['UserName'];
      resolve(obj);
    });
  })
}

function webwxsendmsg(obj) {
  if (!obj.webwxsync) {
    return Promise.resolve(obj);
  }
  return new Promise((resolve, reject)=>{
    //debug('obj in webwxsendmsg:\n' + inspect(obj));
    var BaseRequest = obj.BaseRequest;
    var pass_ticket = obj.pass_ticket;

    // 整体重新设计
    obj.MsgToUserAndSend.map((msgBundle)=>{
      var msgId = (Date.now() + Math.random().toFixed(3)).replace('.', '');
      var postData = {
        BaseRequest: obj.BaseRequest,
        Msg: {
          "Type": 1,
          "Content": msgBundle.Msg,
          "FromUserName": obj.username,
          "ToUserName": msgBundle.User,
          "LocalID": msgId,
          "ClientMsgId": msgId}
      };
      var options = {
        baseUrl: 'https://wx.qq.com',
        uri: `/cgi-bin/mmwebwx-bin/webwxsendmsg?lang=en_US&pass_ticket=${pass_ticket}`,
        method: 'POST',
        jar: true,
        json: true,
        body: postData,
      };

      //debug("options in webwxsendmsg: \n" + inspect(options));
      //debug("postData in webwxsendmsg: \n" + inspect(postData));

      request(options, (error, response, body)=>{
        if (!error) {
          console.log("[机器人回复]", msgBundle.Msg);
        }
      })
    });
    // 重置为[] pop all handled msgs
    obj.MsgToUserAndSend = [];
    resolve(obj);
  });
}

function synccheck(obj) {
  //https://webpush.weixin.qq.com/cgi-bin/mmwebwx-bin/synccheck?r=1452482036596&skey=%40crypt_3bb2969_2e63a3568c783f0d4a9afbab8ba9f0d2&sid=be%2FeK3jB4eicuZct&uin=2684027137&deviceid=e203172097127147&synckey=1_638107724%7C2_638108703%7C3_638108650%7C1000_1452474264&_=1452482035266
  return new Promise((resolve, reject)=>{
    // 重置obj.webwxsync, 默认不需要webwxsync
    obj.webwxsync = false;
    var timestamp = Date.now();
    var skey = obj.BaseRequest.Skey;
    var sid = obj.BaseRequest.Sid;
    var uin = obj.BaseRequest.Uin;
    var deviceid = obj.BaseRequest.DeviceID;
    var synckey = obj.SyncKey.List.map(o=>o.Key + '_' + o.Val).join('|');
    var options = {
      baseUrl: 'https://webpush.weixin.qq.com',
      uri: '/cgi-bin/mmwebwx-bin/synccheck',
      method: 'GET',
      qs: {
        r: timestamp,
        skey: skey,
        sid: sid,
        uin: uin,
        deviceid: deviceid,
        synckey: synckey,
      },
      jar: true,
      timeout: 35000, // 源码这么写的
    }

    request(options, (error, response, body)=>{
      // console.log("synccheck:" + inspect(obj.SyncKey));
      obj.webwxsync = false;
      if (error || !(/retcode:"0"/.test(body)) ){ // 有时候synccheck失败仅仅返回空而没有失败？
        resolve(obj);
      } else if (body == 'window.synccheck={retcode:"1101",selector:"0"}') {
        console.log("服务器断开连接，退出程序")
        sessionStop(1)
      } else if (body !== 'window.synccheck={retcode:"0",selector:"0"}') {
        obj.webwxsync = true;  // 标识有没有新消息，要不要websync
      }
      resolve(obj);
    });
  });
}

function webwxsync(filters, mappers) {
  return (obj)=>{
    // https://wx.qq.com/cgi-bin/mmwebwx-bin/webwxsync?sid=xWam498tVKzNaHLt&skey=@crypt_3bb2969_a8ec83465d303fb83bf7ddcf512c081d&lang=en_US&pass_ticket=YIBmwsusvnbs8l7Z4wtRdBXtslA8JjyHxsy0Fsf3PN8NTiP3fzhjB9rOE%252Fzu6Nur
    if (!obj.webwxsync) {
      return Promise.resolve(obj);
    }
    return new Promise((resolve, reject) => {
      //debug('obj in webwxsync:\n' + inspect(obj));
      var BaseRequest = obj.BaseRequest;
      var pass_ticket = obj.pass_ticket;
      var rr = ~Date.now();
      var postData = {
        BaseRequest: obj.BaseRequest,
        SyncKey: obj.SyncKey
      };
      var options = {
        baseUrl: 'https://wx.qq.com',
        uri: `/cgi-bin/mmwebwx-bin/webwxsync?sid=${obj.BaseRequest.Sid}&skey=${obj.BaseRequest.Skey}&lang=en_US&pass_ticket=${pass_ticket}&rr=${rr}`,
        method: 'POST',
        body: postData,
        json: true,
        jar: true,
        timeout: 15e3,  // 不设定又会hang
      }

      // FIXME: 错误处理
      request(options, (error, response, body)=>{
        // 经常出现socket hang up或者timeout的网络问题
        if (error) {
          //reject(error);
          debug('webwxsync fail: ' + inspect(error));
          resolve(obj);
          return;
        }
        if (!body || body.BaseResponse.Ret !== 0) {
          debug('webwxsync no body: ' + inspect(body));
          resolve(obj);
        }
        // 更新 synckey
        obj.SyncKey = body.SyncKey;
        //debug("in websync body: " + inspect(body))

        // 回复生成部分可以分离出去
        var replys = body.AddMsgList   // 先是默认filter
          .filter(o=>(o.ToUserName === obj.username)) // 过滤不是给我的信息
          .filter(o=>(SPECIAL_USERS.indexOf(o.FromUserName) < 0)) // 不是特殊用户

        filters.forEach(f=> {
          replys=replys.filter(f(obj));
        });

        mappers.forEach(f=> {
          replys=replys.map(f(obj));
        });

        // get all replys resolved 所有回复完成
        // FIXME: webwxsendmsg似乎会被限制并发和频率，也可能只是微信的网络问题
        Promise.all(replys).then(()=>{
          resolve(obj);   // 在回调中控制权交给webwxsendmsg
        });

        // 更新联系人如果有的话
        cacheContact(body.ModContactList, obj);
      });
    });
  }
}

function webwxbatchgetcontact(username, obj) {
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
                   if (!username.startsWith('@@')) {    // 个人
                     var user = body.ContactList[0]
                     obj.memberList.push(user);
                   } else { // 群组
                     var group = body.ContactList[0]
                     var groupRealName = group.NickName;
                     var memberList = group.MemberList;
                     obj.groupContact[username] = {
                       memberList: memberList,
                       nickName: groupRealName, 
                     };
                   }
                   resolve(obj);
                 });
  });
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

function sessionStop(code, signal) {
  console.log('结束会话');
  process.exit(code);
}

module.exports.getUUID = getUUID;
module.exports.checkAndParseUUID = checkAndParseUUID;
module.exports.showQRImage = showQRImage;
module.exports.checkLogin = checkLogin;
module.exports.parseRedirectUrl = parseRedirectUrl;
module.exports.login = login;
module.exports.getbaseRequest = getbaseRequest;
module.exports.webwxinit = webwxinit;
module.exports.getContact = getContact;
module.exports.synccheck = synccheck;
module.exports.webwxsync = webwxsync;
module.exports.webwxsendmsg = webwxsendmsg;
module.exports.webwxbatchgetcontact = webwxbatchgetcontact;
module.exports.webwxgetmsgimg = webwxgetmsgimg;
