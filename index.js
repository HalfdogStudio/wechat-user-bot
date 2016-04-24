'use strict'

var getUUID = require('./lib/webwx.js').getUUID;
var checkAndParseUUID = require('./lib/webwx.js').checkAndParseUUID;
var showQRImage = require('./lib/webwx.js').showQRImage;
var checkLogin = require('./lib/webwx.js').checkLogin;
var parseRedirectUrl = require('./lib/webwx.js').parseRedirectUrl;
var login = require('./lib/webwx.js').login;
var getbaseRequest = require('./lib/webwx.js').getbaseRequest;
var webwxinit = require('./lib/webwx.js').webwxinit;

var wechatLogger = require('./lib/logger/logger.js').wechatLogger;
var generateReply = require('./lib/reply/reply.js').generateReply;

var webwxgetcontact = require('./lib/webwx.js').webwxgetcontact;
var robot = require('./lib/robot.js').robot;

// display, which is a stream
var child_process = require('child_process');
var display = child_process.spawn('display');

getUUID
  .then(checkAndParseUUID)
  .then(showQRImage(display))
  .then(checkLogin)
  .then(parseRedirectUrl)
  .then(login)
  .then(getbaseRequest)
  .then(webwxinit)
  .then(webwxgetcontact)
  .then(robot(
    [(wxSession)=>o=>true],
    [wechatLogger, generateReply]
    // [],
    // [wechatLogger]
  ))
  .catch((e)=>{
    console.error(e);
    process.exit(1);
  });

