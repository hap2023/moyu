// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate
// 统计数据(每天0点触发)
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
// 获取问题的回答redis数据
// 将数据写入集合question-history
// date、view_counts、answer_counts、options等字段
  return {
    event,
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
  }
}