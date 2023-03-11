const Redis = require('ioredis')


const redis = new Redis({
  host: "10.0.0.17",
  port: '6379',
  // family: 4,
  password: 'hapredis123',
  // db: 0
})

exports.redis = redis

// exports.createRedis = () => {
//   return {
//     redis: new Redis({
//       host: "10.0.0.17",
//       port: '6379',
//       // family: 4,
//       password: 'hapredis123',
//       // db: 0
//     })
//   }

// }

/**
 * 加redis全局锁
 * @param {锁的key} lockKey 
 * @param {锁的值} lockValue 
 * @param {持续时间，单位s} duration
 */
exports.lock = async function (lockKey, lockValue, duration) {
  const lockSuccess = await redis.set(lockKey, lockValue, 'EX', duration, 'NX')
  if (lockSuccess) {
    return true
  } else {
    return false
  }
}


/**
 * 解redis全局锁
 * @param {锁的key} lockKey 
 * @param {锁的值} lockValue 
 */
exports.unlock = async function (lockKey, lockValue) {
  const existValue = await redis.get(lockKey)
  if (existValue == lockValue) {
    await redis.del(lockKey)
  }
}
