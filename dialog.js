var request = require('request');

// 我正准备申请答辩
function thesis(content) {
  return Promise.resolve("我在写论文，急事请电话联系");
}

function echo(content) {
  return Promise.resolve(content);
}

function turingRobot(content) {
  // 修正群消息
  content = content.replace(/^[^:]+:<br\/>/m, "");
  //return Promise.resolve(content);
  // 网络版的
  return new Promise((resolve, reject)=> {
    var url = `http://apis.baidu.com/turing/turing/turing`
    request.get(
      url,
      {
        headers: {
          'apikey': '6053e172b7994b684aadfd4ae0841510',
        },
        qs: {
          key: '879a6cb3afb84dbf4fc84a1df2ab7319',
          info: content,
          userid: 'eb2edb736',
        },
        json: true,
      },
      (error, response, body)=>{
        if (error) {
          reject(error);
        }
        //debug("in turing machine: " + inspect(body))
        resolve(body.text);
      });
  });
}

function baiduDirect(content) {
  // TODO:
}

module.exports.turingRobot = turingRobot;
module.exports.echo = echo;
module.exports.thesis = thesis;
