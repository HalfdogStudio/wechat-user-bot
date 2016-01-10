var https = require('https');
var url = require('url');
var querystring = require('querystring');
var fs = require('fs');
var child_process = require('child_process');
var debug = (text)=>console.error("[DEBUG]", text);
var inspect = require('util').inspect;
var request = require('request');
// var debug = ()=>{};

var baseUrl = 'https://wx.qq.com'

var getUUID = new Promise((resolve, reject)=>{
  var param = {
    appid: 'wx782c26e4c19acffb',
    fun: 'new',
    lang: 'en_US',
    _: Date.now()
  }

  var uri = '/jslogin';

  debug(uri);

  var options = {
    uri: uri,
    baseUrl: 'https://login.weixin.qq.com',
    method: 'GET',
    qs: param,
  };

  var req = request(options, (error, response, body)=>{
    if (error) {
      debug(error);
      reject(error);
    }
    resolve(body);
  });
});

function checkAndParseUUID(text) {
  var result = /window.QRLogin.code = (\d+); window.QRLogin.uuid = "([^"]+)";/.exec(text);
  debug("checkAndParseUUID");
  if (result[1] != '200') {
    return false;
  }
  return result[2];
}

function handleError(e) {
  console.log(e);
}

function showQRImage(uuid) {
  var QRUrl = 'https://login.weixin.qq.com/qrcode/' + uuid + '?';
  params = {
    t: 'webwx',
    '_': Date.now()
  }
  debug(QRUrl + querystring.stringify(params))

  var checkLoginPromise = new Promise((resolve, reject)=> {
    // 你猜我为啥忽然用了https而不是request
    // request.pipe到child_process会报错？
    // FIXME
    var req = https.get(QRUrl + querystring.stringify(params), (res)=>{
      debug("showQRImage:\n" + JSON.stringify(res.headers));
      var display = child_process.spawn('display');
      display.on('close', (code)=>{
        resolve(uuid);
      });
      res.pipe(display.stdin);
    });
  })
  return checkLoginPromise;
  // 登录
}

function checkLogin(uuid) {
  // 检查登录和跳转
  var p = new Promise((resolve, reject)=> {
    var timestamp = Date.now();
    var checkUrl = `https://login.weixin.qq.com/cgi-bin/mmwebwx-bin/login?tip=1&uuid=${uuid}&_=${timestamp}`
    // FIXME: request
    https.get(checkUrl, (res)=>{
      var content = '';
      res.setEncoding('utf8');
      res.on('data', (chunk)=>{
        content += chunk;
      })
      res.on('end', ()=> {
        if (/window\.code=200/.test(content)) {
          console.log("LOGIN NOW...");
          debug(content);
          resolve(content);
        } else {
          console.log("restart program...")
          process.exit(1)
        }
      })
    })
  })
  
  return p;
}

function parseRedirectUrl(text) {
  var result = /window\.redirect_uri="([^"]+)";/.exec(text);
  debug("parse redirect_uri: " + result[1]);
  if (!result) {
    console.log("restart program...")
    process.exit(1)
  }
  return result[1]
}

function login(redirectUrl) {
  debug("redirectUrl in login:" + redirectUrl);
  var p = new Promise((resolve, reject)=> {
    request.get({
      url: redirectUrl,
      jar: true,
      followRedirect: false,
    }, (error, response, body)=>{
      // server set cookie here
      //debug("set-cookie in login:\n" + inspect(res.headers));
        resolve(body);
    })
  });

  return p;
}

function getbaseRequest(text) {
  //debug("getbaseRequest： " + text)
  var skey = new RegExp('<skey>([^<]+)</skey>');
  var wxsid = new RegExp('<wxsid>([^<]+)</wxsid>');
  var wxuin = new RegExp('<wxuin>([^<]+)</wxuin>');
  var pass_ticket = new RegExp('<pass_ticket>([^<]+)</pass_ticket>');
  // dirty hack
  var skey = skey.exec(text);
  var wxsid = wxsid.exec(text);
  var wxuin = wxuin.exec(text);
  var pass_ticket = pass_ticket.exec(text);
  // if (!(skey && wxsid && wxuin && pass_ticket)) {
  //   return false;
  // }

  var returnVal =  {
    BaseRequest: {
      Skey: skey[1],
      Sid: wxsid[1],
      Uin: wxuin[1],
      DeviceID: 'e987710405869831'
    }, 
    pass_ticket: pass_ticket[1],
  }
  debug("returnVal: \n" + inspect(returnVal))

  return returnVal;
}

function webwxinit(obj) {
  var p = new Promise((resolve, reject)=> {
    debug("in webwxinit obj:\n" + inspect(obj));
    var postData = {BaseRequest: obj.BaseRequest};
    debug("in webwxinit postData: " + postData);
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
      debug("In webwxinit body: " + inspect(body));
      fs.writeFile('init.json', JSON.stringify(body));
      obj.username = body['User']['UserName'];
      obj.SyncKey = body['SyncKey'];
      debug("My username: " + obj.username)
      resolve(obj);
    })
  });
  return p;
}


function getContact(obj) {
  var p = new Promise((resolve, reject)=> {
    debug('in getContact: \n' + inspect(obj));
    var skey = obj.BaseRequest.Skey;
    var pass_ticket = obj.pass_ticket;
    var jsonFile = fs.createWriteStream('contact.json');
    var timestamp = Date.now();
    var options = {
      baseUrl: 'https://wx.qq.com',
      uri: `/cgi-bin/mmwebwx-bin/webwxgetcontact?lang=en_US&pass_ticket=${pass_ticket}&skey=${skey}&seq=0&r=${timestamp}`,
      method: 'GET',
      json: true,
      jar: true,
    }
    debug("getContact contactUrl: \n" + inspect(options));
    request(options, (error, response, body)=>{
      fs.writeFile('contact.json', JSON.stringify(body));
      var ml = body.MemberList;
      //obj.toUser = ml.filter(m=>(m.NickName == "核心活动都是玩玩玩吃吃吃的北邮GC"))[0]['UserName'];
      resolve(obj);
    });
  })
  return p;
}

function botSpeak(obj) {
  debug('obj in botSpeak:\n' + inspect(obj));
  var BaseRequest = obj.BaseRequest;
  var pass_ticket = obj.pass_ticket;
  var timestamp = Date.now();
  var postData = {
    BaseRequest: obj.BaseRequest,
    Msg: {
      "Type": 1,
      "Content": obj.MsgToSend,
      "FromUserName": obj.username,
      "ToUserName": obj.MsgToUser,
      "LocalID": `${timestamp}0855`,
      "ClientMsgId": `${timestamp}0855`}
  };
  // 14519079059370342
  // 14519073058800623
  var options = {
    baseUrl: 'https://wx.qq.com',
    uri: `/cgi-bin/mmwebwx-bin/webwxsendmsg?lang=en_US&pass_ticket=${pass_ticket}`,
    method: 'POST',
    jar: true,
    json: true,
    body: postData,
  }

  debug("options in botSpeak: \n" + inspect(options));
  debug("postData in botSpeak: \n" + inspect(postData));

  request(options, (error, response, body)=>{
    debug("in botSpeak ret: " + inspect(body));
  })
}

function webwxsync(obj) {
  // FIXME: 这里只是尝试代码
  // 机器人逻辑可能是：
  // 0. webwxinit 获取synckey
  // 1. webwxsync 获取新的synckey，后续使用这个synckey发送和获取消息
  // 2. synccheck,不是ret: 0 selector 0 则websync //似乎是心跳包，得一直保存
  // xx. webwxsync里可能包含数据，
  // 
  // https://wx.qq.com/cgi-bin/mmwebwx-bin/webwxsync?sid=xWam498tVKzNaHLt&skey=@crypt_3bb2969_a8ec83465d303fb83bf7ddcf512c081d&lang=en_US&pass_ticket=YIBmwsusvnbs8l7Z4wtRdBXtslA8JjyHxsy0Fsf3PN8NTiP3fzhjB9rOE%252Fzu6Nur
  // 参数里
  // rr这参数是什么鬼。。。
  // -732077262 先
  // -732579226 后
  var p = new Promise((resolve, reject) => {
    debug('obj in webwxsync:\n' + inspect(obj));
    var BaseRequest = obj.BaseRequest;
    var pass_ticket = obj.pass_ticket;
    var timestamp = Date.now();
    var postData = {
      BaseRequest: obj.BaseRequest,
      SyncKey: obj.SyncKey
    };
    var options = {
      baseUrl: 'https://wx.qq.com',
      uri: `/cgi-bin/mmwebwx-bin/webwxsync?sid=${obj.BaseRequest.Sid}&skey=${obj.BaseRequest.Skey}&lang=en_US&pass_ticket=${pass_ticket}`,
      method: 'POST',
      body: postData,
      json: true,
      jar: true,
    }

    debug("options in webwxsync: \n" + inspect(options));
    debug("postData in webwxsync: \n" + inspect(postData));

    setInterval(()=>{
      //
      // synccheck检查是否需要webwxsync
      // webwxsync检查是否有更新
      // 继续synccheck啥的。。。我猜
      // 当promise遇上循环
      // 请在评论区教教我该怎么在循环中优雅地使用Promise。。。
      request(options, (error, response, body)=>{
        fs.writeFile('webwxsync.json', JSON.stringify(body));
        // 如果Ret: 0，有新消息
        //
        // update synckey
        obj.SyncKey = body.SyncKey;
        // 或者AddMsgCount 为 1
        if (body.AddMsgCount > 0) {
          for (var o of body.AddMsgList) {
            if ((o.MsgType == 1) && (o.ToUserName == obj.username)) { //给我
              debug("in webwxsync someone call me:" + inspect(o));
              obj.MsgToUser = o.FromUserName;
              obj.MsgToSend = "你说：" + o.Content;
              debug('obj in botSpeak:\n' + inspect(obj));
              var BaseRequest = obj.BaseRequest;
              var pass_ticket = obj.pass_ticket;
              var timestamp = Date.now();
              var postData = {
                BaseRequest: obj.BaseRequest,
                Msg: {
                  "Type": 1,
                  "Content": obj.MsgToSend,
                  "FromUserName": obj.username,
                  "ToUserName": obj.MsgToUser,
                  "LocalID": `${timestamp}0855`,
                  "ClientMsgId": `${timestamp}0855`}
              };
              // 14519079059370342
              // 14519073058800623
              var options = {
                baseUrl: 'https://wx.qq.com',
                uri: `/cgi-bin/mmwebwx-bin/webwxsendmsg?lang=en_US&pass_ticket=${pass_ticket}`,
                method: 'POST',
                jar: true,
                json: true,
                body: postData,
              }

              debug("options in botSpeak: \n" + inspect(options));
              debug("postData in botSpeak: \n" + inspect(postData));

              request(options, (error, response, body)=>{
                debug("in botSpeak ret: " + inspect(body));
              })
            }
          }
        }
      });
    }, 2000);
  });
  return p;
}


// FIXME: 以下函数暂时没啥用，果然我手工管理cookie出错换了request就不出错了。。。
// 暂存

function webwxstatusnotify(obj) {
//  https://wx.qq.com/cgi-bin/mmwebwx-bin/webwxstatusnotify?lang=en_US&pass_ticket=wvWelKwCbNcD%252BXOxKkN0XcllbO9zWX74I3W6l3jBTrdT%252BQKDiGXHt06NcqRMxEJK
  debug('obj in webwxstatusnotify:\n' + inspect(obj));
  var BaseRequest = obj.BaseRequest;
  var pass_ticket = obj.pass_ticket;
  var timestamp = Date.now();
  var postData = JSON.stringify({
    BaseRequest: obj.BaseRequest,
    ClientMsgId: timestamp,
    Code: 3,
    FromUserName: obj.username,
    ToUserName: obj.username,
  });
  var options = {
    host: 'wx.qq.com',
    path: `/cgi-bin/mmwebwx-bin/webwxstatusnotify?lang=en_US&pass_ticket=${pass_ticket}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      Cookie: obj.cookie,
      'Content-Length': postData.length
    },
    jar: true,
  }

  debug("options in webwxstatusnotify: \n" + inspect(options));
  debug("postData in webwxstatusnotify: \n" + inspect(postData));

  var req = https.request(options, (res)=>{
    debug("in webwxstatusnotify:\n " + inspect(res.headers));
    var content = '';

    res.on('data', (chunk)=>{
      content += chunk;
    });

    res.on('end', ()=>{
      console.log("res in webwxstatusnotify: " + content);
    });
  })

  req.write(postData);
  req.end()
  return obj;
}


getUUID.
  then(checkAndParseUUID).
  then(showQRImage).
  then(checkLogin).
  then(parseRedirectUrl).
  then(login).
  then(getbaseRequest).
  then(webwxinit).
  then(getContact).
  //then(webwxstatusnotify).
  then(webwxsync).
  //then(botSpeak).
  catch(console.error);


