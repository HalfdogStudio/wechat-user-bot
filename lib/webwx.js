'use strict';
var winston = require('winston');

var logger = new (winston.Logger)({
  level: 'error',
  transports: [
    new (winston.transports.Console)(),
  ]
});

var verbose = (text)=>logger.log('verbose', text);
var info = (text)=>logger.log('info', text);
var error = (text)=>logger.log('error', text);

var inspect = require('util').inspect;
var request = require('request');

var querystring = require('querystring');
var fs = require('fs');

var cacheContact = require('./util.js').cacheContact;
var MINE_EXT = require('./global.js').MINE_EXT;




/** uuid promise */
var getUUID = new Promise((resolve, reject)=>{
  var param = {
    appid: 'wx782c26e4c19acffb',
    fun: 'new',
    redirect_uri: 'https://wx.qq.com/cgi-bin/mmwebwx-bin/webwxnewloginpage',
    lang: 'en_US',
    _: Date.now()
  }

  var uri = '/jslogin';

  //verbose(uri);

  var options = {
    uri: uri,
    baseUrl: 'https://login.weixin.qq.com',
    method: 'GET',
    qs: param,
  };

  info('getuuid')
  var req = request(options, (error, response, body)=>{
    verbose(body);
    if (error) {
      //verbose(error);
      return reject(error);
    }
    resolve(body);
  });
});

/**
 * 获取UUID
 * @param {string} body - 要解析的body
 * @return {Boolean} 标识是否成功获取uuid
 */
function checkAndParseUUID(body) {
  var result = /window.QRLogin.code = (\d+); window.QRLogin.uuid = "([^"]+)";/.exec(body);
  //verbose("checkAndParseUUID");
  if (!result || result[1] != '200') {
    return false;
  }
  return result[2];
}

/**
 * 展示二维码
 * @param {Object} display - display Stream 对象
 * @return {Promise} session对象 
 */
function showQRImage(display) {
  return (uuid) => {
    console.log("请扫描二维码并确认登录，关闭二维码窗口继续...");
    var QRUrl = 'https://login.weixin.qq.com/qrcode/' + uuid + '?';
    var param = {
      t: 'webwx',
      '_': Date.now()
    }

    var checkLoginPromise = new Promise((resolve, reject)=> {
      display.on('exit', wxSessionStop);
      info("GET " + QRUrl)
      var req = request(QRUrl, {qs: param});
      req.on('response', ()=>{
        resolve({
          uuid: uuid,
          display: display, // 将display传递下去
          tip: 1, //标识
        });
      })
      req.pipe(display.stdin);
      req.on('error', (err)=>{
        return reject(err);
      })
    });

    return checkLoginPromise;
    // 登录
  }
}

/**
 * 检查扫描二维码状况
 * @param {Object} wxSession - 微信会话
 * @return {Promise} wxSession对象 
 */
function checkLogin(wxSession) {
  var timestamp = ~Date.now();
  
  var uuid = wxSession.uuid;
  var display = wxSession.display;
  // 检查登录和跳转
  return new Promise((resolve, reject)=> {
    var checkUrl = `https://login.weixin.qq.com/cgi-bin/mmwebwx-bin/login?tip=${wxSession.tip}&uuid=${uuid}&r=${timestamp}` 
    info('GET ' + checkUrl)
    request(checkUrl,
            (error, response, body)=>{
              verbose(body);
              if (error) {
                return reject(error);
              }
              verbose("in checkLogin: " + body);
              if (/window\.code=200/.test(body)) {
                console.log("登录微信...");
                // 删除退出子进程杀掉主进程的回调
                display.removeListener('exit', wxSessionStop)
                display.kill();
                resolve(body);
              } else if(/window\.code=201/.test(body)){
                wxSession.tip = 0;  // 第一次之后tip都为0，不然下一个请求不是长连接
                // NOTE: 在这里我试了一会儿
                // 关键是对promise的理解。
                // !! 总结！！
                console.log("已扫描，请点击确认登录");
                resolve(checkLogin(wxSession)); 
              } else if(/window\.code=408/.test(body)){
                resolve(checkLogin(wxSession));
              } else {
                console.log("验证码超时...")
                display.kill();
                wxSessionStop(1);
              }
            });
  });
}

/**
 * 解析登录地址
 * @param {String} body - 返回体
 * @return {String} 登录地址
 */
function parseRedirectUrl(text) {
  var result = /window\.redirect_uri="([^"]+)";/.exec(text);
  // verbose("parse redirect_uri: " + inspect(result));
  if (!result) {
    console.log("无重定向地址");
    wxSessionStop(1);
  }
  return result[1]
}

/**
 * 登录
 * @param {String} redirectUrl - 登录地址
 * @return {Promise} 返回体Promise
 */
function login(redirectUrl) {
  //verbose("redirectUrl in login:" + redirectUrl);
  var wxSession = Object.create(null);
  wxSession.wxJar = request.jar();
  return new Promise((resolve, reject)=> {
    info('GET ' + redirectUrl);
    request.get({
      url: redirectUrl,
      jar: wxSession.wxJar,
      followRedirect: false,
    }, (error, response, body)=>{
      verbose(body);
      // server set cookie here，之后的操作需要cookie
      if (error) {
        return reject(error);
      }
      wxSession.loginBody = body;
      resolve(wxSession);
    })
  });
}

/**
 * 获取baseRequest函数
 * @param {String} wxSession - 登录时返回体
 * @return {Object} 包含BaseRequest和pass_ticket对象
 */
function getbaseRequest(wxSession) {
  var text = wxSession.loginBody;
  ////verbose("getbaseRequest： " + text)
  var skey = new RegExp('<skey>([^<]+)</skey>');
  var wxsid = new RegExp('<wxsid>([^<]+)</wxsid>');
  var wxuin = new RegExp('<wxuin>([^<]+)</wxuin>');
  var pass_ticket = new RegExp('<pass_ticket>([^<]+)</pass_ticket>');
  // dirty hack
  var skey = skey.exec(text);
  var wxsid = wxsid.exec(text);
  var wxuin = wxuin.exec(text);
  var pass_ticket = pass_ticket.exec(text);

  wxSession.BaseRequest = {
      Skey: skey[1],
      Sid: wxsid[1],
      Uin: wxuin[1],
      DeviceID: 'e' + ('' + Math.random().toFixed(15)).substring(2, 17)
    };
  wxSession.pass_ticket = pass_ticket[1];

  return wxSession;
}

/**
 * webwxinit
 * @param {Object} wxSession - 微信会话
 * @return {Promise} 代表微信会话的Promise
 */
function webwxinit(wxSession) {
  console.log("登录成功，初始化");
  // 参见uproxy_wechat，使用面向对象的方式实现变量传递
  wxSession.groupContact = Object.create(null);
  wxSession.MsgToUserAndSend = [];
  return new Promise((resolve, reject)=> {
    //verbose("in webwxinit wxSession:\n" + inspect(wxSession));
    var postData = {BaseRequest: wxSession.BaseRequest};
    //verbose("in webwxinit postData: " + postData);
    var timestamp = Date.now();
    var options = {
      baseUrl: 'https://wx.qq.com',
      uri: `/cgi-bin/mmwebwx-bin/webwxinit?lang=en_US&pass_ticket=${wxSession.pass_ticket}`,
      method: 'POST',
      body: postData,
      json: true,
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
      },
      jar: wxSession.wxJar,
    } 
    info(options.method + options.baseUrl + options.uri);
    var req = request(options, (error, response, body) => {
      verbose(body);
      if (error) {
        return reject(error);
      }
      //verbose("In webwxinit body: " + inspect(body));
      // fs.writeFile('init.json', JSON.stringify(body));
      wxSession.username = body['User']['UserName'];
      wxSession.nickname = body['User']['NickName'];
      wxSession.SyncKey = body['SyncKey'];
      resolve(wxSession);
    })
  });
}


/**
 * @param {Object} wxSession - 微信会话
 * @return {Promise} 代表微信会话的Promise
 */
function webwxgetcontact(wxSession) {
  console.log("初始化成功，获取联系人...")
  return new Promise((resolve, reject)=> {
    var skey = wxSession.BaseRequest.Skey;
    var pass_ticket = wxSession.pass_ticket;
    // var jsonFile = fs.createWriteStream('contact.json');
    var timestamp = Date.now();
    var options = {
      baseUrl: 'https://wx.qq.com',
      uri: `/cgi-bin/mmwebwx-bin/webwxgetcontact?lang=en_US&pass_ticket=${pass_ticket}&skey=${skey}&seq=0&r=${timestamp}`,
      method: 'GET',
      json: true,
      jar: wxSession.wxJar,
    }
    info(options.method + options.baseUrl + options.uri);
    request(options, (error, response, body)=>{
      if (error) {
        return reject(error);
      }
      verbose(body)
      // fs.writeFile('contact.json', JSON.stringify(body));
      wxSession.memberList = body.MemberList;
      //wxSession.toUser = memberList.filter(m=>(m.NickName == "核心活动都是玩玩玩吃吃吃的北邮GC"))[0]['UserName'];
      console.log("联系人获取完毕...");
      console.log("<--OK-->");
      resolve(wxSession);
    });
  })
}

/**
 * @param {String} msg - 准备发送的消息
 * @param {String} toUser - 用户username
 * @param {Object} wxSession - 微信会话
 * @return {Promise} 代表微信会话的Promise
 */
function webwxsendmsg(msg, toUser, wxSession) {
  var msgId = (Date.now() + Math.random().toFixed(3)).replace('.', '');
  var BaseRequest = wxSession.BaseRequest;
  var pass_ticket = wxSession.pass_ticket;
  var postData = {
    BaseRequest: BaseRequest,
    Msg: {
      "Type": 1,
      "Content": msg,
      "FromUserName": wxSession.username,
      "ToUserName": toUser,
      "LocalID": msgId,
      "ClientMsgId": msgId}
  };
  var options = {
    baseUrl: 'https://wx.qq.com',
    uri: `/cgi-bin/mmwebwx-bin/webwxsendmsg?lang=en_US&pass_ticket=${pass_ticket}`,
    method: 'POST',
    jar: wxSession.wxJar,
    json: true,
    body: postData,
  };

  info("webwxsendmsg:" + options.method + " " + options.baseUrl + options.uri)
  request(options, (error, response, body)=>{
    verbose(body);
    if (!error) {
      console.log("发送-> ", msg);
    }
  });
}

/**
 * @param {Object} wxSession - 微信会话
 * @return {Promise} 代表微信会话的Promise
 */
function synccheck(wxSession) {
  //https://webpush.weixin.qq.com/cgi-bin/mmwebwx-bin/synccheck?r=1452482036596&skey=%40crypt_3bb2969_2e63a3568c783f0d4a9afbab8ba9f0d2&sid=be%2FeK3jB4eicuZct&uin=2684027137&deviceid=e203172097127147&synckey=1_638107724%7C2_638108703%7C3_638108650%7C1000_1452474264&_=1452482035266
  return new Promise((resolve, reject)=>{
    // FIXME: 在这里检查合适吗？每次synccheck开始的时候
    if (wxSession.socketFail >= 6) {
      reject(new Error('wxSession socket fail TOO MUCH(maybe network lost)'));
      wxSessionStop(3);
      return;
    }
    // 重置wxSession.webwxsync, 默认不需要webwxsync
    wxSession.webwxsync = false;
    var timestamp = Date.now();
    var skey = wxSession.BaseRequest.Skey;
    var sid = wxSession.BaseRequest.Sid;
    var uin = wxSession.BaseRequest.Uin;
    var deviceid = wxSession.BaseRequest.DeviceID;
    var synckey = wxSession.SyncKey.List.map(o=>o.Key + '_' + o.Val).join('|');
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
      jar: wxSession.wxJar,
      timeout: 35000, // 源码这么写的
    }

    info(options.method + " " + options.baseUrl + options.uri)
    request(options, (error, response, body)=>{

      wxSession.webwxsync = false;

      if (error || !(/retcode:"0"/.test(body)) ){ // 有时候synccheck失败仅仅返回空而没有失败？
        wxSession.socketFail = (wxSession.socketFail || 0) + 1;
        resolve(wxSession);
        return;
      }
      // 正常
      wxSession.socketFail = 0;

      verbose(body);

      if (body == 'window.synccheck={retcode:"1101",selector:"0"}') {
        console.log("服务器断开连接，退出程序")
        reject(new Error('wxSessionStop'))
      } else if (body !== 'window.synccheck={retcode:"0",selector:"0"}') {
        wxSession.webwxsync = true;  // 标识有没有新消息，要不要websync
      } else {
        wxSession.webwxsync = false;  // 还是写出来清晰一些
      }
      resolve(wxSession);
    });
  });
}

/**
 * @param {Object} wxSession - 微信会话
 * @return {Function} 接受wxSession的函数该函数返回包含wxSession的Promise
 */
function webwxsync(handleMsg) {
  return (wxSession)=>{
    // https://wx.qq.com/cgi-bin/mmwebwx-bin/webwxsync?sid=xWam498tVKzNaHLt&skey=@crypt_3bb2969_a8ec83465d303fb83bf7ddcf512c081d&lang=en_US&pass_ticket=YIBmwsusvnbs8l7Z4wtRdBXtslA8JjyHxsy0Fsf3PN8NTiP3fzhjB9rOE%252Fzu6Nur
    if (!wxSession.webwxsync) {
      return Promise.resolve(wxSession);
    }
    return new Promise((resolve, reject) => {
      //verbose('wxSession in webwxsync:\n' + inspect(wxSession));
      var BaseRequest = wxSession.BaseRequest;
      var pass_ticket = wxSession.pass_ticket;
      var rr = ~Date.now();
      var postData = {
        BaseRequest: wxSession.BaseRequest,
        SyncKey: wxSession.SyncKey
      };
      var options = {
        baseUrl: 'https://wx.qq.com',
        uri: `/cgi-bin/mmwebwx-bin/webwxsync?sid=${wxSession.BaseRequest.Sid}&skey=${wxSession.BaseRequest.Skey}&lang=en_US&pass_ticket=${pass_ticket}&rr=${rr}`,
        method: 'POST',
        body: postData,
        json: true,
        jar: wxSession.wxJar,
        timeout: 15e3,  // 不设定又会hang
      }

      info(options.method + " " + options.baseUrl + options.uri)
      request(options, (error, response, body)=>{
        verbose(body);
        // 经常出现socket hang up或者timeout的网络问题
        if (error) {
          //reject(error);
          verbose('webwxsync fail: ' + inspect(error));
          resolve(wxSession);
          return;
        }
        if (!body || body.BaseResponse.Ret !== 0) {
          verbose('webwxsync no body: ' + inspect(body));
          resolve(wxSession);
          return;
        }
        // 更新 synckey
        wxSession.SyncKey = body.SyncKey;
        //verbose("in websync body: " + inspect(body))

        // 更新联系人如果有的话
        cacheContact(body.ModContactList, wxSession);
        // 消息处理更新
        handleMsg(body.AddMsgList, wxSession);
        resolve(wxSession);
      });
    });
  }
}

/**
 * @param {String} username - 用户名
 * @param {Object} wxSession - 微信会话
 * @return {Function} 接受wxSession的函数该函数返回包含wxSession的Promise
 */
function webwxbatchgetcontact(username, wxSession) {
  return new Promise((resolve, reject)=>{
    var postData = {
      BaseRequest: wxSession.BaseRequest,
      Count: 1,
      List: [
        {
          UserName: username,
          EncryChatRoomId: "",
        }
      ]
    };
    // console.log("为啥Promise里看不到运行情况")
    info('POST ' + `https://wx.qq.com/cgi-bin/mmwebwx-bin/webwxbatchgetcontact`);
    request.post(`https://wx.qq.com/cgi-bin/mmwebwx-bin/webwxbatchgetcontact`,
                 {
                   qs: {
                     type: 'ex',
                     r: Date.now(),
                   },
                   body: postData,
                   json: true,
                   jar: wxSession.wxJar,
                 },
                 (error, response, body)=> {
                   verbose(body);
                   // 错误处理
                   if (error || !body) {
                     return reject(error)
                   }
                   if (body.BaseResponse.Ret != 0) {
                     return reject(body.BaseResponse.ErrMsg);
                   }
                   // 本地缓存
                   if (!username.startsWith('@@')) {    // 个人
                     var user = body.ContactList[0]
                     wxSession.memberList.push(user);
                   } else { // 群组
                     var group = body.ContactList[0]
                     var groupRealName = group.NickName;
                     var memberList = group.MemberList;
                     wxSession.groupContact[username] = {
                       memberList: memberList,
                       nickName: groupRealName, 
                     };
                   }
                   resolve(wxSession);
                 });
  });
}

/**
 * @param {String} msgId - 消息id
 * @param {Object} wxSession - 微信会话
 * @param {String} imgPath - 图像保存路径
 * @return {Promise} - 返回图像路径Promise
 */
function webwxgetmsgimg(o, wxSession, imgPath){
  var msgId = o.MsgId
  return new Promise((resolve, reject)=>{
    var imgUrl = `https://wx.qq.com/cgi-bin/mmwebwx-bin/webwxgetmsgimg?&MsgID=${msgId}&skey=${querystring.escape(wxSession.BaseRequest.Skey)}`;
    // 保存图片到文件
    var req = request.get(imgUrl, {jar: wxSession.wxJar})
    req.on('error', (e) => {
      error('下载图像资源失败:', e);
      reject(e) //may not work if stream error
    })
    .on('response', (res) => {
      var ext = MINE_EXT[res.headers['content-type']]
      imgPath = imgPath + '.' + ext;
      req.pipe(fs.createWriteStream(imgPath));
      resolve(imgPath);
    })
  })
}

/**
 * @param {String} o - 消息对象
 * @param {Object} wxSession - 微信会话
 * @param {String} voicePath - 音频保存路径
 * @return {Promise} - 返回音频路径的Promise
 */
function webwxgetvoice(o, wxSession, voicePath){
  var msgId = o.MsgId
  return new Promise((resolve, reject)=>{
    var voiceUrl = `https://wx.qq.com/cgi-bin/mmwebwx-bin/webwxgetvoice?&MsgID=${msgId}&skey=${querystring.escape(wxSession.BaseRequest.Skey)}`;
    // 保存图片到文件
    var req = request.get(voiceUrl, {jar: wxSession.wxJar});
    req.on('error', (e) => {
      error('下载音频资源失败:', e);
      reject(e)
    })
    .on('response', (res) => {
      var ext = MINE_EXT[res.headers['content-type']]
      voicePath = voicePath + '.' + ext;
      req.pipe(fs.createWriteStream(voicePath))
      resolve(voicePath)
    })
  });
}

/**
 * @param {String} o - 消息对象
 * @param {Object} wxSession - 微信会话
 * @param {String} videoPath - 视频保存路径
 * @return {Promise} - 返回视频路径的Promise
 */
function webwxgetvideo(o, wxSession, videoPath){
  var msgId = o.MsgId
  return new Promise((resolve, reject)=>{
    var voiceUrl = `https://wx.qq.com/cgi-bin/mmwebwx-bin/webwxgetvideo?&MsgID=${msgId}&skey=${querystring.escape(wxSession.BaseRequest.Skey)}`;
    // 保存图片到文件
    var req = request.get(voiceUrl, {
      jar: wxSession.wxJar,
      headers: {
        Range: 'bytes=0-',
      }
    });
    req.on('error', (e) => {
      error('下载视频资源失败:', e);
      reject(e);
    })
    .on('response', (res) => {
      var ext = MINE_EXT[res.headers['content-type']]
      videoPath = videoPath + '.' + ext;
      req.pipe(fs.createWriteStream(videoPath))
      resolve(videoPath);
    })
  });
}

/**
 * 获取表情
 * @param {String} o - 消息对象
 * @param {Object} wxSession - 微信会话
 * @param {String} emotionPath - 视频保存路径
 * @return {Promise} - 返回表情保存路径的Promise
 */
function webwxgetemoticon(o, wxSession, emotionPath){
  if (o.HasProductId) {
    return Promise.resolve("只能在手机上查看的表情")
  }
  var result = /cdnurl\s*=\s*"([^"]+)"/.exec(o.Content);
  if (result) {
    var emotionUrl = result[1];
  } else {
    return Promise.reject(new Error("NotValidEmoticon"))
  }
  return new Promise((resolve, reject)=>{
    if (!emotionUrl){
      let e = new Error("EmotionImageNotFound")
      e.message = o.Content
      return reject()
    }
    // 保存图片到文件
    // console.log(emotionUrl);
    var req = request.get(emotionUrl)
    req.on('error', (e) => {
      error('下载表情失败:', e);
      reject(e);
    })
    .on('response', (res) => {
      var ext = MINE_EXT[res.headers['content-type']]
      emotionPath = emotionPath + '.' + ext;
      req.pipe(fs.createWriteStream(emotionPath))
      resolve(emotionPath);
    })
  });
}

/**
 * @param {String} o - 消息对象
 * @param {Object} wxSession - 微信会话
 * @param {String} filePath - 文件保存路径
 * @return {Promise} - 返回文件路径的Promise
 */
function webwxgetmedia(o, wxSession, filePath){
  var msgId = o.MsgId
  var pass_ticket = wxSession.pass_ticket;
  var uin = wxSession.BaseRequest.Uin;
  var webwx_data_ticket = wxSession.wxJar._jar.store.idx['qq.com']['/']['webwx_data_ticket'].value;
  return new Promise((resolve, reject)=>{
    https://file.wx.qq.com/cgi-bin/mmwebwx-bin/webwxgetmedia?sender=@7aa7aa34a3be4cfc0cfad8ac800de2e1d4dc6caa766b530e1e7df95123bc5a12&mediaid=@crypt_d61b9b14_9b97decb6a21f7c3352ac6b8cf57b48d0f01ff3893a82bee7413df77b5f121170b3ba8deffb1bf7342be9d7ffd571bc6f6bb967ee4f817e027259ccf0cc0e1a2f5e10aca031a6e1a7570d3e19fa7a9e5ed954b4a3cc0f99243a5b0224039ff80f846d6642085684dad203de71d03b601f2f7ea80aaeead2f34855d690ba276b093094f3a13007095626d116d16c380c02adc303fa2d113faaebd780af601f0d1248aa5f249b6f44758321cd468001183cdcaa210e2adde3a4a92223bcb9d3956c848584a35c28ed3d73dcbdbc7cf357601aa324bdde3cc91cc854131876c0ab9&filename=wechat-robot-ai.pdf&fromuser=236008826&pass_ticket=7zPTudVswLgxEDOcCxgh%252F%252B6BWMNZAl17fUVipy6qVDY%253D&webwx_data_ticket=AQdNG6jmVgp9Rh8Fwcth7Ax9
    var fileUrl = `https://file.wx.qq.com/cgi-bin/mmwebwx-bin/webwxgetmedia?&sender=${o.FromUserName}&skey=${querystring.escape(wxSession.BaseRequest.Skey)}`;
    var params = {
      sender: o.FromUserName,
      mediaid: o.MediaId,
      filename: o.FileName,
      pass_ticket: pass_ticket,
      fromuser: uin,
      webwx_data_ticket: webwx_data_ticket,
    }
    // 保存图片到文件
    var req = request.get(fileUrl, {
      qs: params,
      headers: {
        Range: 'bytes=0-',
      },
      jar: wxSession.wxJar,
    });
    req.on('error', (e) => {
      error('下载文件资源失败:', e);
      reject(e);
    })
    .on('response', (res) => {
      filePath = filePath + '-' + o.FileName;
      req.pipe(fs.createWriteStream(filePath))
      resolve(filePath);
    })
  });
}
/**
 * 登出
 * @param {Object} wxSession - 微信会话
 * @return {Promise} - 返回登出结果的Promise
 */
function webwxlogout(wxSession){
  var skey = wxSession.BaseRequest.Skey;
  var sid = wxSession.BaseRequest.Sid;
  var uin = wxSession.BaseRequest.Uin;
  var param = {
    redirect: "1",
    type: "0",
    skey: skey,
  }
  return new Promise((resolve, reject)=> {
    var formData = {
      sid: sid,
      uin: uin
    };
    var options = {
      baseUrl: 'https://wx.qq.com',
      uri: `/cgi-bin/mmwebwx-bin/webwxlogout`,
      method: 'POST',
      qs: param,
      form: formData,
      jar: wxSession.wxJar,
    } 
    info(options.method + options.baseUrl + options.uri);
    var req = request(options, (error, response, body) => {
      verbose(body);
      if (error) {
        return reject(error);
      }
      if (response.statusCode == 301) {
        info('成功登出');
        return resolve(true);
      } else {
        error('登出失败');
        return resolve(false);
      }
    })
  });
}

// FIXME: clean it!
/**
 * @param {Number} code - 错误码
 */
function wxSessionStop(code, signal) {
  console.log('结束会话');
  throw new Error('wxSessionStop:' + code);
}

module.exports.getUUID = getUUID;
module.exports.checkAndParseUUID = checkAndParseUUID;
module.exports.showQRImage = showQRImage;
module.exports.checkLogin = checkLogin;
module.exports.parseRedirectUrl = parseRedirectUrl;
module.exports.login = login;
module.exports.getbaseRequest = getbaseRequest;
module.exports.webwxinit = webwxinit;
module.exports.webwxgetcontact = webwxgetcontact;
module.exports.synccheck = synccheck;
module.exports.webwxsync = webwxsync;
module.exports.webwxsendmsg = webwxsendmsg;
module.exports.webwxbatchgetcontact = webwxbatchgetcontact;
module.exports.webwxgetmsgimg = webwxgetmsgimg;
module.exports.webwxgetvoice = webwxgetvoice;
module.exports.webwxgetvideo = webwxgetvideo;
module.exports.webwxgetemoticon = webwxgetemoticon;
module.exports.webwxlogout = webwxlogout;
module.exports.webwxgetmedia = webwxgetmedia;
