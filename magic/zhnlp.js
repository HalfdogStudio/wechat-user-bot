'use strict'
// 载入模块
var Segment = require('segment');
// 创建实例
var segment = new Segment();
segment.useDefault();

const HanziOrEngReg = /^(:?(?:[\u3300-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F]|[\uD840-\uD868\uD86A-\uD872][\uDC00-\uDFFF]|\uD869[\uDC00-\uDEDF\uDF00-\uDFFF]|\uD873[\uDC00-\uDEAF]|\uD87E[\uDC00-\uDE1F])|(?:[a-z]))+$/m;

function processArticle(article) {
  return article.
    replace(/\s(?=[^a-z])/g, ''). // 不移除单词间的空格儿
    replace(/(。{2,})|(\.{2,})|(…{2,})|(⋯{1,})/g, '…').
    replace(',', '，').
    replace('?', '？').
    replace(/([^\d])(\.)([^\d])/g, '$1。$2').
    replace('!', '！');
}

function *splitSentences(article) {
  var stopFlag = false;
  var stopCharacters = "。？！…\n";
  var sentence = "";
  for (let c of article) {
    if (stopFlag && stopCharacters.indexOf(c) < 0) {
      stopFlag = false;
      yield sentence;
      sentence = "";
    }
    if (stopCharacters.indexOf(c) >= 0) {
      stopFlag = true;
    }
    sentence += c;
  }
  yield sentence;
}

function generateSentence(article) {
  return splitSentences(processArticle(article))
}

function isHanziOrEng(s) {
  return HanziOrEngReg.test(s);
}

module.exports.generateSentence = generateSentence;
module.exports.cut = (text)=>segment.doSegment(text, {simple: true});
module.exports.isHanziOrEng = isHanziOrEng;
