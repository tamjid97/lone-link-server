const fs = require('fs');
const key = fs.readFileSync('./lonelink-d3167-firebase-adminsdk-fbsvc-409877217b.json', 'utf8')
const base64 = Buffer.from(key).toString('base64')
console.log(base64)