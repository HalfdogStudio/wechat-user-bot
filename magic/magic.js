'use strict'
var fs = require('fs');
var path = require('path');
var generateSentence = require('./zhnlp.js').generateSentence;
var cut = require('./zhnlp.js').cut;
var isHanziOrEng = require('./zhnlp.js').isHanziOrEng;

// 计算句子出现频率
var sentences = Object.create(null);
var nOfSentences = 0;

var w2s = Object.create(null);
var wfall = Object.create(null);

// 语料处理
var data = '';
var dataDir = __dirname + '/data/';
try {
  var files = fs.readdirSync(dataDir)
} catch(e) {
  console.error(e);
}

for (let file of files) {
  data += fs.readFileSync(path.resolve(dataDir, file)).toString();
}

// 统计句子数和出现次数
for (let s of generateSentence(data)) {
  nOfSentences += 1
  if (!sentences[s]) {
    sentences[s] = 0;
  }
  sentences[s] += 1;
}


// 计算句子出现频率
for (let s of generateSentence(data)) {
  sentences[s] /= nOfSentences;
}

// 计算每一个句子中单词出现频率
for (let s in sentences) {
  let words = cut(s, "MIX").filter(isHanziOrEng).filter(filterStopWords);
  let wf = {};
  var sumwf = 0;
  for (let i = 0; i < words.length; i++) {
    let w = words[i];
    if (!wf[w]) {
      wf[w] = 0;
    }
    wf[w] += 1;
  }
  for (let w in wf) {
    wf[w] /= words.length;
    wf[w] *= sentences[s];
  }

  // 计算总数
  for (let w in wf) {
    sumwf += wf[w];
  }

  for (let w in wf) {
    if (!wfall[w]) {
      wfall[w] = Object.create(null);
      wfall[w][s] = Object.create(null);
    }
    wfall[w][s] = wf[w] / sumwf;
  }
}

function findSentence(input) {
  let max = 0;
  // 随机找句话
  let sent = Object.keys(sentences)[Math.floor(Math.random()*Object.keys(sentences).length)]
  let words = cut(input, "FULL").filter(isHanziOrEng).filter(filterStopWords);
  let wf = Object.create(null);
  for (let w of words) {
    if (!wf[w]) {
      wf[w] = 0;
    }
    wf[w] += 1;
  }
  for (let w of words) {
    if (wfall[w]) {
      // 取最大
      // 我为啥要这么设计。。数据解构
      for (let s in wfall[w]) {
        if (wfall[w][s] * wf[w] / words.length  > max) {
          max = wfall[w][s] * wf[w] / words.length;
          sent = s;
        }
      }
    }
  }
  return Promise.resolve(sent);
}

function filterStopWords(s) {
  return "我们说但是所以不你们也就都给的一个啊那这到要".indexOf(s) < 0
}

// findSentence("北邮的邱神知道么，比你们高到不知哪里去了，我跟他谈笑风生。")
module.exports = findSentence;
