'use strict'

var getUUID = require('./webwx.js').getUUID;
var checkAndParseUUID = require('./webwx.js').checkAndParseUUID;
var showQRImage = require('./webwx.js').showQRImage;
var checkLogin = require('./webwx.js').checkLogin;
var parseRedirectUrl = require('./webwx.js').parseRedirectUrl;
var login = require('./webwx.js').login;
var getbaseRequest = require('./webwx.js').getbaseRequest;
var webwxinit = require('./webwx.js').webwxinit;
var getContact = require('./webwx.js').getContact;
var robot = require('./webwx.js').robot;

getUUID.
  then(checkAndParseUUID).
  then(showQRImage).
  then(checkLogin).
  then(parseRedirectUrl).
  then(login).
  then(getbaseRequest).
  then(webwxinit).
  then(getContact).
  then(robot).
  catch(console.error);

