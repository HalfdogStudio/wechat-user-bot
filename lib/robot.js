var synccheck = require('./webwx.js').synccheck;
var webwxsync = require('./webwx.js').webwxsync;
var handleMsg = require('./util.js').handleMsg;

function robot(filters, transducers) {
  return (wxSession) => {
    synccheck(wxSession)
    .then(webwxsync(handleMsg(filters, transducers)))
    .then(robot(filters, transducers))
    .catch(console.error);
  }
}

module.exports.robot = robot;
