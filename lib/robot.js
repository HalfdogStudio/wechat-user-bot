var synccheck = require('./webwx.js').synccheck;
var webwxsync = require('./webwx.js').webwxsync;
var webwxsendmsg = require('./webwx.js').webwxsendmsg;

function robot(filters, mappers) {
  return (obj) => {
    synccheck(obj)
    .then(webwxsync(filters, mappers))
    .then(webwxsendmsg)
    .then(robot(filters, mappers))
    .catch(console.error);
  }
}

module.exports.robot = robot;
