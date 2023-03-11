'use strict';

const redis = require('redis')

let client = redis.createClient({
    host: process.env.HOST,
    port: process.env.PORT,
    // 需要填写真实的密码
    password: 'xxx'
})

exports.main = async (event, context, callback) => {

    let res = await new Promise((resolve, reject) => {
        client.get('test', function (err, reply) {
            if (err) {
                resolve({
                    err
                })
            }
            resolve({
                data: reply
            })
        })
    })

    return {
        res
    }
}