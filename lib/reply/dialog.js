'use strict'
var request = require('request');
var inspect = require('util').inspect;
var apikeys = require('../../config/apikeys.js')

function thesis(content) {
  return Promise.resolve("hello world");
}

function echo(content) {
  return Promise.resolve(content);
}

function turingRobot(content, userid) {
  content = content.replace(/^[^:]+:<br\/>/m, "");
  return new Promise((resolve, reject)=> {
    var url = `http://www.tuling123.com/openapi/api`
    request.get(
      url,
      {
        qs: {
          key: apikeys.turingRobotApiKey,
          info: content,
          userid: userid.slice(0, 32),
        },
        json: true,
      },
      (error, response, body)=>{
        if (error || !body) {
          reject(error?error:"turing robot return no body");
        }
        //debug("in turing machine: " + inspect(body))
        try {
          body.text = body.text.replace(/<\s*br\s*\/?\s*>/g, '\n');
          if (body.code == 100000) {
            resolve(body.text);
          } else if (body.code == 200000) {
            resolve(body.text + ": " + body.url);
          } else if (body.code == 302000) {
            resolve(body.list.map(n=>n.article + ": " + n.detailurl).join('\n'));
          } else if (body.code == 308000) {
            resolve(body.text + '\n' + body.list.map(n=>n.name + ": " + n.info + "<" + n.detailurl + ">").join('\n'));
          } else {
            reject(body.code + body.text);
          } 
        } catch(e) {
          reject(e);
        }
      });
  });
}

function turingBaiduRobot(content, userid) {
  content = content.replace(/^[^:]+:<br\/>/m, "");
  return new Promise((resolve, reject)=> {
    var url = `http://apis.baidu.com/turing/turing/turing`
    request.get(
      url,
      {
        headers: {
          'apikey': apikeys.turingBaiduRobotApiKey,
        },
        qs: {
          key: apikeys.turingBaiduRobotKey,
          info: content,
          userid: userid.slice(0, 32),
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
  // FIXME: not work
  var mode;
  var re = /^([\u4E00-\u9FD5]+)从([\u4E00-\u9FD5])+到([\u4E00-\u9FD5]+)$/mg
  var result = re.exec(content);
  if (!result) {
    notFound();
  }
  switch (result[1]) {
    case "公交":
      mode = 'transit';
      break;
    case "步行":
      mode = 'walking';
      break;
    case "开车":
      mode = 'driving';
      break;
    default:
      notFound();
  }
  var origin = result[2];
  var destination = result[3];

  var p = new Promise((resolve, reject)=>{
    var param = {
      origin: origin,
      destination: destination,
      mode: 'transit',
      region: '北京',
      origin_region: '北京',
      destination_region: '北京',
      output: 'json',
      ak: apikeys.baiduDirectApiKey,
    };

    request('http://api.map.baidu.com/direction/v1',
            {
              qs: param,
              json: true,
            },
            (error, response, body)=>{
              if (error) {
                reject(error);
              }
              console.log(inspect(body));
              if (body.status != 0) {
                resolve(notFound());
              }
              if (body.type == 2) {
                resolve(body.routes[0].scheme.steps)
              } else if (body.type == 1) {
                resolve(notFound());
              }
            })
  })
  return p;

  function notFound() {
    return Promise.resolve("没有查询到相应的路线")
  }
}

function magic(content, userid) {
  // TODO: a magic trigger engine
  var result;
  var map = new Map();
  // map顺序其实是固定的，参见hacks.mozilla.org
  map.set(/好不好/g, '吼啊！');
  map.set(/那么早就说要([\u4E00-\u9FD5]+)，会不会给人感觉是([\u4E00-\u9FD5]+)/g, '任何事，也要按照基本法！按照$1法来进行。刚才你问我，我可以回答一句「无可奉告」，但是你们又不高兴，我怎么办？我讲的意思不是要$2。你问我支持不支持，我说支持。我就明确告诉你这一点。我感觉你们文化界还需要学习，你们毕竟还是 too young ，你明白这意思吧？我告诉你们我是身经百战了，见得多了！');
  map.set(/(支持)|(支不支持)|(支持不支持)/g, '当然啦！');
  map.set(/(exciting)|(激动)|(感动)/g, '亦可赛艇！');
  map.set(/(谈笑风生)|(高到)|(不知哪里)/g, '北邮的邱神你知道么，比你高到不知哪里去了，我跟他谈笑风生，所以说你还需要学习一个。');
  map.set(/学习(一个)?/g, '所以说你们还是要提高自己的知识水平，识得唔识得啊？我为你们感到拙计呀……');
  map.set(/([\u4E00-\u9FD5]来[\u4E00-\u9FD5]去)/g, '你们有一个好，全世界跑到什么地方，你们比北邮的学生找工作跑得都快，但是$1这个水平呀，都 too simple ， sometimes naive ！懂了没有？');
  map.set(/(simple)|naive/ig, '你们啊！too simple ， sometimes naive ！懂了没有？');
  map.set(/(热情)|(不说话)/g, '但是我想我见到你们这样热情，一句话不说也不好。');
  map.set(/(发大财)|(发财)/g, '中国有一句话叫「闷声发大财」，我就什么话也不说，这是最好的。');
  map.set(/(负责)|(责任)/g, '在宣传上将来如果你们报道上有偏差，你们要负责任。');
  map.set(/(人生)|(经验)/g, '我有必要告诉你们一些人生的经验……');
  map.set(/大新闻/g, '你们不要想喜欢弄个大新闻，说现在已经定了，把我批判一番。');
  map.set(/naive/ig, '你们啊，naive！');
  map.set(/(angry)|很生气/ig, 'I am angry！你们这样子是不行的！我今天算是得罪了你们一下。');
  for (let reg of map) {
    if (result = reg[0].exec(content)) {
      return Promise.resolve(result[0].replace(reg[0], reg[1]));
    }
  }
  return Promise.resolve(turingRobot(content, userid));
}

module.exports.turingRobot = turingRobot;
module.exports.echo = echo;
module.exports.thesis = thesis;
module.exports.baiduDirect = baiduDirect;
