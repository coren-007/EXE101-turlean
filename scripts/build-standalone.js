const fs = require('fs')

function copyRecursiveSync(src, dest) {
  const stats = fs.statSync(src)
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
    fs.readdirSync(src).forEach((item) => {
      copyRecursiveSync(`${src}/${item}`, `${dest}/${item}`)
    })
  } else {
    fs.copyFileSync(src, dest)
  }
}

if (!fs.existsSync('.next/standalone')) {
  console.log('No standalone output found, skipping copy')
  process.exit(0)
}

copyRecursiveSync('.next/static', '.next/standalone/.next/static')
copyRecursiveSync('public', '.next/standalone/public')
console.log('Build artifacts prepared for standalone output')
