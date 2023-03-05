// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate
// 初始化数据,只针对热门的前50条问题和最新的50条问题(每天0点开始，每隔20分钟触发，直到早上6点)
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  // 

  return {
    event,
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
  }
}